import fs from 'node:fs'
import net, { type Socket } from 'node:net'
import tls from 'node:tls'
import appConfig from '../util/config'
import { logger } from '../util/logger'
import { checkPasswordHash, getUserById } from '../db/user'
import { userCanLogin } from '../util/auth'
import {
  dnEqual,
  entryInScope,
  getLDAPEntries,
  getLDAPEntryByDN,
  getLDAPUserByDN,
  type LDAPAttributes,
  type LDAPEntry,
  type LDAPSearchScope,
  searchScope,
} from './directory'

const RESULT_SUCCESS = 0
const RESULT_OPERATIONS_ERROR = 1
const RESULT_COMPARE_FALSE = 5
const RESULT_COMPARE_TRUE = 6
const RESULT_PROTOCOL_ERROR = 2
const RESULT_INVALID_CREDENTIALS = 49
const RESULT_INSUFFICIENT_ACCESS = 50

type LDAPServer = net.Server | tls.Server

type LDAPConnection = {
  bindDN: string
  buffer: Buffer
  socket: Socket
}

type LDAPMessage = {
  id: number
  op: BERElement
}

type BERElement = {
  tag: number
  value: Buffer
}

type LDAPFilter
  = { type: 'and', filters: LDAPFilter[] }
    | { type: 'or', filters: LDAPFilter[] }
    | { type: 'not', filter: LDAPFilter }
    | { type: 'equality', attribute: string, value: string }
    | { type: 'substrings', attribute: string, initial?: string, any: string[], final?: string }
    | { type: 'greaterOrEqual' | 'lessOrEqual' | 'approx', attribute: string, value: string }
    | { type: 'present', attribute: string }

type SearchRequest = {
  baseDN: string
  scope: LDAPSearchScope
  sizeLimit: number
  filter: LDAPFilter
  attributes: string[]
}

type CompareRequest = {
  dn: string
  attribute: string
  value: string
}

export function startLDAPServer(): LDAPServer | undefined {
  if (!appConfig.LDAP_ENABLED) {
    return
  }

  const server = appConfig.LDAP_TLS_CERT_FILE && appConfig.LDAP_TLS_KEY_FILE
    ? tls.createServer({
        cert: fs.readFileSync(appConfig.LDAP_TLS_CERT_FILE),
        key: fs.readFileSync(appConfig.LDAP_TLS_KEY_FILE),
      }, (socket) => {
        handleConnection(socket)
      })
    : net.createServer((socket) => {
        handleConnection(socket)
      })

  server.on('error', (error: Error) => {
    logger({
      level: 'error',
      message: 'LDAP Server error',
      errors: [error],
    })
  })

  server.listen(appConfig.LDAP_PORT, appConfig.LDAP_HOST, () => {
    const scheme = appConfig.LDAP_TLS_CERT_FILE ? 'ldaps' : 'ldap'
    logger({
      level: 'info',
      message: `LDAP Server listening at ${scheme}://${appConfig.LDAP_HOST}:${String(appConfig.LDAP_PORT)}`,
    })
  })

  return server
}

function handleConnection(socket: Socket) {
  const connection: LDAPConnection = {
    bindDN: '',
    buffer: Buffer.alloc(0),
    socket,
  }

  socket.on('data', (chunk) => {
    connection.buffer = Buffer.concat([connection.buffer, chunk])
    void processBuffer(connection)
  })

  socket.on('error', (error) => {
    logger({
      level: 'error',
      message: 'LDAP client connection error',
      errors: [error],
    })
  })
}

async function processBuffer(connection: LDAPConnection) {
  while (connection.buffer.length) {
    const frame = readLDAPFrame(connection.buffer)

    if (!frame) {
      return
    }

    connection.buffer = connection.buffer.subarray(frame.length)

    try {
      const message = readLDAPMessage(frame.value)
      await handleMessage(connection, message)
    } catch (error) {
      logger({
        level: 'error',
        message: 'LDAP protocol error',
        errors: error instanceof Error ? [error] : [{ message: String(error) }],
      })
      connection.socket.write(ldapResult(0, 0x61, RESULT_PROTOCOL_ERROR))
    }
  }
}

async function handleMessage(connection: LDAPConnection, message: LDAPMessage) {
  switch (message.op.tag) {
    case 0x60:
      await handleBind(connection, message.id, message.op)
      return
    case 0x63:
      await handleSearch(connection, message.id, message.op)
      return
    case 0x6e:
      await handleCompare(connection, message.id, message.op)
      return
    case 0x42:
      connection.socket.end()
      return
    default:
      connection.socket.write(ldapResult(message.id, 0x61, RESULT_PROTOCOL_ERROR, '', 'Unsupported LDAP operation'))
  }
}

async function handleBind(connection: LDAPConnection, messageId: number, op: BERElement) {
  try {
    const reader = new BERReader(op.value)
    const version = reader.readInteger()
    const dn = reader.readString()
    const auth = reader.readElement()
    const password = auth.tag === 0x80 ? auth.value.toString('utf8') : ''

    if (version !== 3 || auth.tag !== 0x80) {
      connection.socket.write(ldapResult(messageId, 0x61, RESULT_PROTOCOL_ERROR))
      return
    }

    if (dnEqual(dn, '') && password === '') {
      connection.bindDN = ''
      connection.socket.write(ldapResult(messageId, 0x61, RESULT_SUCCESS))
      return
    }

    if (dnEqual(dn, appConfig.LDAP_BIND_DN)) {
      if (appConfig.LDAP_BIND_PASSWORD && password === appConfig.LDAP_BIND_PASSWORD) {
        connection.bindDN = appConfig.LDAP_BIND_DN
        connection.socket.write(ldapResult(messageId, 0x61, RESULT_SUCCESS))
        return
      }

      connection.socket.write(ldapResult(messageId, 0x61, RESULT_INVALID_CREDENTIALS))
      return
    }

    const user = await getLDAPUserByDN(dn)
    if (!user || !password || !await checkPasswordHash(user.id, password)) {
      connection.socket.write(ldapResult(messageId, 0x61, RESULT_INVALID_CREDENTIALS))
      return
    }

    const details = await getUserById(user.id)
    if (!userCanLogin(details, ['pwd'])) {
      connection.socket.write(ldapResult(messageId, 0x61, RESULT_INVALID_CREDENTIALS))
      return
    }

    connection.bindDN = dn
    connection.socket.write(ldapResult(messageId, 0x61, RESULT_SUCCESS))
  } catch (error) {
    logger({
      level: 'error',
      message: 'LDAP bind failed',
      errors: error instanceof Error ? [error] : [{ message: String(error) }],
    })
    connection.socket.write(ldapResult(messageId, 0x61, RESULT_OPERATIONS_ERROR))
  }
}

async function handleSearch(connection: LDAPConnection, messageId: number, op: BERElement) {
  try {
    const req = readSearchRequest(op.value)

    if (!canSearch(connection) && !(dnEqual(req.baseDN, '') && searchScope(req.scope) === 'base')) {
      connection.socket.write(ldapResult(messageId, 0x65, RESULT_INSUFFICIENT_ACCESS))
      return
    }

    const entries = await getLDAPEntries()
    let sent = 0

    for (const entry of entries) {
      if (req.sizeLimit && sent >= req.sizeLimit) {
        break
      }

      if (entryInScope(req.baseDN, entry.dn, req.scope) && filterMatches(req.filter, entry.attributes)) {
        connection.socket.write(searchEntry(messageId, entry, req.attributes))
        sent += 1
      }
    }

    connection.socket.write(ldapResult(messageId, 0x65, RESULT_SUCCESS))
  } catch (error) {
    logger({
      level: 'error',
      message: 'LDAP search failed',
      errors: error instanceof Error ? [error] : [{ message: String(error) }],
    })
    connection.socket.write(ldapResult(messageId, 0x65, RESULT_OPERATIONS_ERROR))
  }
}

async function handleCompare(connection: LDAPConnection, messageId: number, op: BERElement) {
  try {
    if (!canSearch(connection)) {
      connection.socket.write(ldapResult(messageId, 0x6f, RESULT_INSUFFICIENT_ACCESS))
      return
    }

    const req = readCompareRequest(op.value)
    const entry = await getLDAPEntryByDN(req.dn)
    const values = attributeValues(entry?.attributes, req.attribute)
    const result = values.some(value => value === req.value) ? RESULT_COMPARE_TRUE : RESULT_COMPARE_FALSE

    connection.socket.write(ldapResult(messageId, 0x6f, result))
  } catch (error) {
    logger({
      level: 'error',
      message: 'LDAP compare failed',
      errors: error instanceof Error ? [error] : [{ message: String(error) }],
    })
    connection.socket.write(ldapResult(messageId, 0x6f, RESULT_OPERATIONS_ERROR))
  }
}

function canSearch(connection: LDAPConnection) {
  return appConfig.LDAP_ALLOW_ANONYMOUS_SEARCH
    || dnEqual(connection.bindDN, appConfig.LDAP_BIND_DN)
    || (!!connection.bindDN && !dnEqual(connection.bindDN, appConfig.LDAP_BIND_DN))
}

function readSearchRequest(value: Buffer): SearchRequest {
  const reader = new BERReader(value)
  const baseDN = reader.readString()
  const scope = reader.readInteger() as LDAPSearchScope
  reader.readInteger()
  const sizeLimit = reader.readInteger()
  reader.readInteger()
  reader.readBoolean()
  const filter = readFilter(reader.readElement())
  const attributes = reader.readSequence(0x30).map(element => element.value.toString('utf8'))

  return { baseDN, scope, sizeLimit, filter, attributes }
}

function readCompareRequest(value: Buffer): CompareRequest {
  const reader = new BERReader(value)
  const dn = reader.readString()
  const avaElement = reader.readElement()

  if (avaElement.tag !== 0x30) {
    throw new Error('Expected compare attribute value assertion')
  }

  const ava = new BERReader(avaElement.value)
  const attribute = ava.readString()
  const requestValue = ava.readString()

  return { dn, attribute, value: requestValue }
}

function readFilter(element: BERElement): LDAPFilter {
  switch (element.tag) {
    case 0xa0:
      return { type: 'and', filters: new BERReader(element.value).readAll().map(readFilter) }
    case 0xa1:
      return { type: 'or', filters: new BERReader(element.value).readAll().map(readFilter) }
    case 0xa2:
      return { type: 'not', filter: readFilter(new BERReader(element.value).readElement()) }
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
      filter.any.push(value)
    } else if (substring.tag === 0x82) {
      filter.final = value
    }
  }

  return filter
}

function filterMatches(filter: LDAPFilter, attributes: LDAPAttributes): boolean {
  switch (filter.type) {
    case 'and':
      return filter.filters.every(child => filterMatches(child, attributes))
    case 'or':
      return filter.filters.some(child => filterMatches(child, attributes))
    case 'not':
      return !filterMatches(filter.filter, attributes)
    case 'equality':
    case 'approx':
      return attributeValues(attributes, filter.attribute).some(value => value.toLowerCase() === filter.value.toLowerCase())
    case 'greaterOrEqual':
      return attributeValues(attributes, filter.attribute).some(value => value.localeCompare(filter.value) >= 0)
    case 'lessOrEqual':
      return attributeValues(attributes, filter.attribute).some(value => value.localeCompare(filter.value) <= 0)
    case 'present':
      return attributeValues(attributes, filter.attribute).length > 0
    case 'substrings':
      return attributeValues(attributes, filter.attribute).some(value => substringMatches(value, filter))
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

function attributeValues(attributes: LDAPAttributes | undefined, name: string) {
  if (!attributes) {
    return []
  }

  const key = Object.keys(attributes).find(key => key.toLowerCase() === name.toLowerCase())
  const value = key ? attributes[key] : undefined

  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function searchEntry(messageId: number, entry: LDAPEntry, requestedAttributes: string[]) {
  const attributes = Object.entries(selectedAttributes(entry.attributes, requestedAttributes)).map(([name, values]) => berSequence([
    berOctetString(name),
    berSet((Array.isArray(values) ? values : [values]).map(value => berOctetString(value))),
  ]))

  return ldapMessage(messageId, 0x64, [
    berOctetString(entry.dn),
    berSequence(attributes),
  ])
}

function selectedAttributes(attributes: LDAPAttributes, requestedAttributes: string[]) {
  const names = requestedAttributes.map(attribute => attribute.toLowerCase())

  if (!names.length || names.includes('*')) {
    return attributes
  }

  const selected: LDAPAttributes = {}

  for (const [key, value] of Object.entries(attributes)) {
    if (names.includes(key.toLowerCase())) {
      selected[key] = value
    }
  }

  return selected
}

function ldapResult(messageId: number, tag: number, resultCode: number, matchedDN = '', diagnosticMessage = '') {
  return ldapMessage(messageId, tag, [
    berEnumerated(resultCode),
    berOctetString(matchedDN),
    berOctetString(diagnosticMessage),
  ])
}

function ldapMessage(messageId: number, applicationTag: number, children: Buffer[]) {
  return berSequence([
    berInteger(messageId),
    berTLV(applicationTag, Buffer.concat(children)),
  ])
}

function readLDAPFrame(buffer: Buffer) {
  if (buffer[0] !== 0x30) {
    throw new Error('LDAP message must be a sequence')
  }

  const length = readLength(buffer, 1)
  if (!length || buffer.length < 1 + length.bytes + length.value) {
    return
  }

  return {
    length: 1 + length.bytes + length.value,
    value: buffer.subarray(1 + length.bytes, 1 + length.bytes + length.value),
  }
}

function readLDAPMessage(value: Buffer): LDAPMessage {
  const reader = new BERReader(value)
  const id = reader.readInteger()
  const op = reader.readElement()

  return { id, op }
}

class BERReader {
  private offset = 0

  constructor(private readonly buffer: Buffer) {}

  readAll() {
    const elements: BERElement[] = []

    while (this.offset < this.buffer.length) {
      elements.push(this.readElement())
    }

    return elements
  }

  readSequence(tag = 0x30) {
    const element = this.readElement()

    if (element.tag !== tag) {
      throw new Error(`Expected BER tag 0x${tag.toString(16)}, got 0x${element.tag.toString(16)}`)
    }

    return new BERReader(element.value).readAll()
  }

  readInteger() {
    const element = this.readElement()

    if (element.tag !== 0x02 && element.tag !== 0x0a) {
      throw new Error(`Expected integer, got 0x${element.tag.toString(16)}`)
    }

    let value = 0

    for (const byte of element.value) {
      value = (value << 8) | byte
    }

    return value
  }

  readBoolean() {
    const element = this.readElement()

    if (element.tag !== 0x01 || element.value.length !== 1) {
      throw new Error('Expected boolean')
    }

    return element.value[0] !== 0
  }

  readString() {
    const element = this.readElement()

    if (element.tag !== 0x04) {
      throw new Error(`Expected string, got 0x${element.tag.toString(16)}`)
    }

    return element.value.toString('utf8')
  }

  readElement(): BERElement {
    if (this.offset + 2 > this.buffer.length) {
      throw new Error('Incomplete BER element')
    }

    const tag = this.buffer[this.offset]

    if (tag == null) {
      throw new Error('Incomplete BER element')
    }
    const length = readLength(this.buffer, this.offset + 1)

    if (!length || this.offset + 1 + length.bytes + length.value > this.buffer.length) {
      throw new Error('Invalid BER length')
    }

    const valueStart = this.offset + 1 + length.bytes
    const valueEnd = valueStart + length.value
    this.offset = valueEnd

    return {
      tag,
      value: this.buffer.subarray(valueStart, valueEnd),
    }
  }
}

function readLength(buffer: Buffer, offset: number) {
  const first = buffer[offset]

  if (first == null) {
    return
  }

  if (!(first & 0x80)) {
    return { bytes: 1, value: first }
  }

  const byteCount = first & 0x7f

  if (!byteCount || byteCount > 4 || offset + byteCount >= buffer.length) {
    return
  }

  let value = 0

  for (let index = 0; index < byteCount; index += 1) {
    const byte = buffer[offset + 1 + index]

    if (byte == null) {
      return
    }

    value = (value << 8) | byte
  }

  return { bytes: 1 + byteCount, value }
}

function berSequence(children: Buffer[]) {
  return berTLV(0x30, Buffer.concat(children))
}

function berSet(children: Buffer[]) {
  return berTLV(0x31, Buffer.concat(children))
}

function berInteger(value: number) {
  const bytes: number[] = []
  let remaining = value

  do {
    bytes.unshift(remaining & 0xff)
    remaining >>= 8
  } while (remaining)

  if ((bytes[0] ?? 0) & 0x80) {
    bytes.unshift(0)
  }

  return berTLV(0x02, Buffer.from(bytes))
}

function berEnumerated(value: number) {
  const bytes: number[] = []
  let remaining = value

  do {
    bytes.unshift(remaining & 0xff)
    remaining >>= 8
  } while (remaining)

  if ((bytes[0] ?? 0) & 0x80) {
    bytes.unshift(0)
  }

  return berTLV(0x0a, Buffer.from(bytes))
}

function berOctetString(value: string) {
  return berTLV(0x04, Buffer.from(value, 'utf8'))
}

function berTLV(tag: number, value: Buffer) {
  return Buffer.concat([Buffer.from([tag]), berLength(value.length), value])
}

function berLength(length: number) {
  if (length < 0x80) {
    return Buffer.from([length])
  }

  const bytes: number[] = []
  let remaining = length

  while (remaining) {
    bytes.unshift(remaining & 0xff)
    remaining >>= 8
  }

  return Buffer.from([0x80 | bytes.length, ...bytes])
}
