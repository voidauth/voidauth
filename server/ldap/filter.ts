import { stringCompare } from '@shared/utils'
import type { LDAPAttributes } from './directory'
import { BERReader, type BERElement } from './ber'
import zod from 'zod'

export type LDAPFilter
  = { type: 'and', filters: LDAPFilter[] }
    | { type: 'or', filters: LDAPFilter[] }
    | { type: 'not', filter: LDAPFilter }
    | { type: 'equality', attribute: string, value: string }
    | { type: 'substrings', attribute: string, initial?: string, any: string[], final?: string }
    | { type: 'greaterOrEqual' | 'lessOrEqual' | 'approx', attribute: string, value: string }
    | { type: 'present', attribute: string }

export const LDAPFilterSchema: zod.ZodType<LDAPFilter> = zod.union([
  zod.object({ type: zod.literal('and'), filters: zod.array(zod.lazy((): typeof LDAPFilterSchema => LDAPFilterSchema)) }),
  zod.object({ type: zod.literal('or'), filters: zod.array(zod.lazy((): typeof LDAPFilterSchema => LDAPFilterSchema)) }),
  zod.object({ type: zod.literal('not'), filter: zod.lazy((): typeof LDAPFilterSchema => LDAPFilterSchema) }),
  zod.object({ type: zod.literal('equality'), attribute: zod.string(), value: zod.string() }),
  zod.object({
    type: zod.literal('substrings'),
    attribute: zod.string(),
    initial: zod.string().optional(),
    any: zod.array(zod.string()),
    final: zod.string().optional(),
  }),
  zod.object({ type: zod.literal('greaterOrEqual'), attribute: zod.string(), value: zod.string() }),
  zod.object({ type: zod.literal('lessOrEqual'), attribute: zod.string(), value: zod.string() }),
  zod.object({ type: zod.literal('approx'), attribute: zod.string(), value: zod.string() }),
  zod.object({ type: zod.literal('present'), attribute: zod.string() }),
])

const MAX_FILTER_DEPTH = 10
const MAX_SUBSTRING_PARTS = 100
const JPEG_PHOTO_OID = '0.9.2342.19200300.100.1.60'

export function readFilter(element: BERElement, depth: number = 0): LDAPFilter {
  if (depth > MAX_FILTER_DEPTH) {
    throw new Error('LDAP filter nesting too deep')
  }
  switch (element.tag) {
    case 0xa0:
      return { type: 'and', filters: new BERReader(element.value).readAll().map(el => readFilter(el, depth + 1)) }
    case 0xa1:
      return { type: 'or', filters: new BERReader(element.value).readAll().map(el => readFilter(el, depth + 1)) }
    case 0xa2:
      return { type: 'not', filter: readFilter(new BERReader(element.value).readElement(), depth + 1) }
    case 0xa3: {
      const reader = new BERReader(element.value)
      return { type: 'equality', attribute: reader.readString(), value: reader.readString() }
    }
    case 0xa4:
      return readSubstringFilter(element.value)
    case 0xa5: {
      const reader = new BERReader(element.value)
      return { type: 'greaterOrEqual', attribute: reader.readString(), value: reader.readString() }
    }
    case 0xa6: {
      const reader = new BERReader(element.value)
      return { type: 'lessOrEqual', attribute: reader.readString(), value: reader.readString() }
    }
    case 0x87:
      return { type: 'present', attribute: element.value.toString('utf8') }
    case 0xa8: {
      const reader = new BERReader(element.value)
      return { type: 'approx', attribute: reader.readString(), value: reader.readString() }
    }
    default:
      throw new Error(`Unsupported LDAP filter: 0x${element.tag.toString(16)}`)
  }
}

function readSubstringFilter(value: Buffer): LDAPFilter {
  const reader = new BERReader(value)
  const attribute = reader.readString()
  const substringsElement = reader.readElement()

  if (substringsElement.tag !== 0x30) {
    throw new Error('Expected substring sequence')
  }

  const substrings = new BERReader(substringsElement.value).readAll()
  const filter: LDAPFilter = { type: 'substrings', attribute, any: [] }

  for (const substring of substrings) {
    const value = substring.value.toString('utf8')

    if (substring.tag === 0x80) {
      filter.initial = value
    } else if (substring.tag === 0x81) {
      if (filter.any.length >= MAX_SUBSTRING_PARTS) {
        throw new Error('Too many substring parts')
      }
      filter.any.push(value)
    } else if (substring.tag === 0x82) {
      filter.final = value
    }
  }

  return filter
}

// Make sure attribute names (jpegphoto) match correctly
function canonicalAttributeName(attributeDescription: string) {
  const type = attributeDescription.split(';')[0]?.toLowerCase() ?? ''
  return type === JPEG_PHOTO_OID ? 'jpegphoto' : type
}

function attributeNamesMatch(left: string, right: string) {
  return canonicalAttributeName(left) === canonicalAttributeName(right)
}

function attributeValues(attributes: LDAPAttributes | undefined, name: string) {
  if (!attributes) {
    return []
  }

  const key = Object.keys(attributes).find(key => attributeNamesMatch(key, name))
  const value = key ? attributes[key] : undefined

  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

export function stringAttributeValues(attributes: LDAPAttributes | undefined, name: string) {
  return attributeValues(attributes, name).filter((value): value is string => typeof value === 'string')
}

export function filterMatches(filter: LDAPFilter, attributes: LDAPAttributes): boolean {
  switch (filter.type) {
    case 'and':
      return filter.filters.every(child => filterMatches(child, attributes))
    case 'or':
      return filter.filters.some(child => filterMatches(child, attributes))
    case 'not':
      return !filterMatches(filter.filter, attributes)
    case 'equality':
    case 'approx':
      return stringAttributeValues(attributes, filter.attribute).some(value => value.toLowerCase() === filter.value.toLowerCase())
    case 'greaterOrEqual':
      return stringAttributeValues(attributes, filter.attribute).some(value => stringCompare(value, filter.value) >= 0)
    case 'lessOrEqual':
      return stringAttributeValues(attributes, filter.attribute).some(value => stringCompare(value, filter.value) <= 0)
    case 'present':
      return attributeValues(attributes, filter.attribute).length > 0
    case 'substrings':
      return stringAttributeValues(attributes, filter.attribute).some(value => substringMatches(value, filter))
  }
}

function substringMatches(input: string, filter: Extract<LDAPFilter, { type: 'substrings' }>) {
  let remaining = input.toLowerCase()

  if (filter.initial) {
    const initial = filter.initial.toLowerCase()
    if (!remaining.startsWith(initial)) {
      return false
    }
    remaining = remaining.slice(initial.length)
  }

  for (const part of filter.any) {
    const index = remaining.indexOf(part.toLowerCase())

    if (index < 0) {
      return false
    }

    remaining = remaining.slice(index + part.length)
  }

  return filter.final ? remaining.endsWith(filter.final.toLowerCase()) : true
}

// True when the filter references given attribute (a search must load that attribute before matching)
export function filterReferencesAttribute(filter: LDAPFilter, requestedName: string): boolean {
  switch (filter.type) {
    case 'and':
    case 'or':
      return filter.filters.some(child => filterReferencesAttribute(child, requestedName))
    case 'not':
      return filterReferencesAttribute(filter.filter, requestedName)
    case 'equality':
    case 'substrings':
    case 'greaterOrEqual':
    case 'lessOrEqual':
    case 'approx':
    case 'present':
      return attributeNamesMatch(filter.attribute, requestedName)
  }
}

// True when the request asks for given attribute (empty or '*' means "all attributes").
export function requestsAttribute(requestedAttributes: string[], requestedName: string) {
  if (!requestedAttributes.length) {
    return true
  }
  const requested = canonicalAttributeName(requestedName)
  return requestedAttributes.some(attribute => canonicalAttributeName(attribute) === '*' || canonicalAttributeName(attribute) === requested)
}

// Picks the attributes to include in a search response
export function selectedAttributes(attributes: LDAPAttributes, requestedAttributes: string[]) {
  const names = requestedAttributes.map(canonicalAttributeName)

  if (!names.length || names.includes('*')) {
    return attributes
  }

  const selected: LDAPAttributes = {}

  for (const [key, value] of Object.entries(attributes)) {
    if (names.includes(canonicalAttributeName(key))) {
      selected[key] = value
    }
  }

  return selected
}
