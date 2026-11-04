import zod from 'zod'
import { BERReader } from './ber'
import { LDAPFilterSchema, readFilter } from './filter'
import type { LDAPSearchScope } from './directory'

// Security limits
const MAX_SEARCH_ATTRIBUTES = 100

const SearchRequestSchema = zod.object({
  baseDN: zod.string(),
  scope: zod.union([
    zod.literal('base'),
    zod.literal('one'),
    zod.literal('sub'),
    zod.literal(0),
    zod.literal(1),
    zod.literal(2),
  ]),
  sizeLimit: zod.number().int().nonnegative(),
  filter: LDAPFilterSchema,
  attributes: zod.array(zod.string()),
})

export type SearchRequest = zod.infer<typeof SearchRequestSchema>

const CompareRequestSchema = zod.object({
  dn: zod.string(),
  attribute: zod.string(),
  value: zod.string(),
})

export type CompareRequest = zod.infer<typeof CompareRequestSchema>

function isLDAPSearchScope(scope: string | number): scope is LDAPSearchScope {
  return ['base', 'one', 'sub', 0, 1, 2].includes(scope)
}

export function readSearchRequest(value: Buffer): SearchRequest {
  const reader = new BERReader(value)
  const baseDN = reader.readString()
  const scope = reader.readInteger()
  // ensure scope is valid before reading more of the request
  if (!isLDAPSearchScope(scope)) {
    throw new Error('Invalid search scope')
  }
  reader.readInteger()
  const sizeLimit = reader.readInteger()
  reader.readInteger()
  reader.readBoolean()
  const filter = readFilter(reader.readElement())
  const attrs = reader.readSequence(0x30)
  if (attrs.length > MAX_SEARCH_ATTRIBUTES) {
    throw new Error('Too many requested attributes')
  }
  const attributes = attrs.map(element => element.value.toString('utf8'))

  const searchRequest = SearchRequestSchema.safeParse({ baseDN, scope, sizeLimit, filter, attributes })

  if (!searchRequest.success) {
    throw new Error('Invalid search request')
  }

  return searchRequest.data
}

export function readCompareRequest(value: Buffer): CompareRequest {
  const reader = new BERReader(value)
  const dn = reader.readString()
  const avaElement = reader.readElement()

  if (avaElement.tag !== 0x30) {
    throw new Error('Expected compare attribute value assertion')
  }

  const ava = new BERReader(avaElement.value)
  const attribute = ava.readString()
  const requestValue = ava.readString()

  const compareRequest = CompareRequestSchema.safeParse({ dn, attribute, value: requestValue })
  if (!compareRequest.success) {
    throw new Error('Invalid compare request')
  }

  return compareRequest.data
}
