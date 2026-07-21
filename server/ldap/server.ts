import fs from 'node:fs'
import net, { type Socket } from 'node:net'
import tls from 'node:tls'
import appConfig from '../util/config'
import { logger, purgeAsyncLog } from '../util/logger'
import { checkPasswordHash, getUserById } from '../db/user'
import { userCanLogin } from '../util/auth'
import {
  dnEqual,
  entryInScope,
  getLDAPEntries,
  getLDAPEntryByDN,
  getLDAPUserIdByDN,
  type LDAPAttributes,
  type LDAPEntry,
  type LDAPSearchScope,
  MAX_SEARCH_RESULTS,
  searchScope,
} from './directory'
import { timingSafeEqual } from 'node:crypto'
import zod from 'zod'
import { als } from '../util/als'

const RESULT_SUCCESS = 0
const RESULT_OPERATIONS_ERROR = 1
const RESULT_COMPARE_FALSE = 5
const RESULT_COMPARE_TRUE = 6
const RESULT_PROTOCOL_ERROR = 2
const RESULT_INVALID_CREDENTIALS = 49
const RESULT_INSUFFICIENT_ACCESS = 50

// Security limits
const MAX_FRAME_SIZE = 64 * 1024 // 64 KiB per LDAP frame
const MAX_BUFFER_SIZE = 256 * 1024 // 256 KiB per connection buffer
const MAX_BER_SEQUENCE_ELEMENTS = 200
const MAX_SEARCH_ATTRIBUTES = 100
const MAX_INTEGER_BYTES = 4 // limit BER integer byte length

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

const LDAPFilterSchema: zod.ZodType<LDAPFilter> = zod.union([
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

type SearchRequest = zod.infer<typeof SearchRequestSchema>

const CompareRequestSchema = zod.object({
  dn: zod.string(),
  attribute: zod.string(),
  value: zod.string(),
})

type CompareRequest = zod.infer<typeof CompareRequestSchema>

export function startLDAPServer() {
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

  server.on('error', (error) => {
    logger({
      level: 'error',
      message: 'LDAP Server error',
      errors: [error instanceof Error ? error : { message: String(error) }],
    })
  })

  server.listen(appConfig.LDAP_PORT, () => {
    logger({
      level: 'info',
      message: `LDAP Server listening on ${typeof appConfig.LDAP_PORT === 'number' ? 'port' : 'socket'}: ${String(appConfig.LDAP_PORT)}`,
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
    als.run({}, () => {
      if (connection.buffer.length + chunk.length > MAX_BUFFER_SIZE) {
        logger({ level: 'debug', message: 'LDAP client sent too much data; closing connection' })
        connection.socket.write(ldapResult(0, 0x61, RESULT_OPERATIONS_ERROR, '', 'Frame too large'))
        connection.socket.destroy()
        return
      }

      connection.buffer = Buffer.concat([connection.buffer, chunk])
      void processBuffer(connection).then(() => {
        purgeAsyncLog()
      })
    })
  })

  socket.on('error', (error) => {
    logger({
      level: 'debug',
      message: 'LDAP client connection error',
      errors: [error instanceof Error ? error : { message: String(error) }],
    })
  })
}

async function processBuffer(connection: LDAPConnection) {
  while (connection.buffer.length) {
    let frame
    try {
      frame = readLDAPFrame(connection.buffer)
    } catch (error) {
      logger({
        level: 'debug',
        message: 'LDAP frame parse error',
        errors: error instanceof Error ? [error] : [{ message: String(error) }],
      })
      connection.socket.write(ldapResult(0, 0x61, RESULT_PROTOCOL_ERROR))
      connection.socket.destroy()
      return
    }

    if (!frame) {
      return
    }

    if (frame.length > MAX_FRAME_SIZE || frame.value.length > MAX_FRAME_SIZE) {
      logger({ level: 'debug', message: 'LDAP frame exceeds maximum allowed size' })
      connection.socket.write(ldapResult(0, 0x61, RESULT_PROTOCOL_ERROR))
      connection.socket.destroy()
      return
    }

    connection.buffer = connection.buffer.subarray(frame.length)

    try {
      const message = readLDAPMessage(frame.value)
      await handleMessage(connection, message)
    } catch (error) {
      logger({
        level: 'debug',
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
      logger({ level: 'debug', message: 'LDAP handle bind request' })
      await handleBind(connection, message.id, message.op)
      return
    case 0x63:
      logger({ level: 'debug', message: 'LDAP handle search request' })
      await handleSearch(connection, message.id, message.op)
      return
    case 0x6e:
      logger({ level: 'debug', message: 'LDAP handle compare request' })
      await handleCompare(connection, message.id, message.op)
      return
    case 0x77:
      logger({ level: 'debug', message: 'LDAP handle extended request' })
      handleExtendedRequest(connection, message.id, message.op)
      return
    case 0x42:
      // 'close connection' request. We oblige.
      connection.socket.end()
      return
    default:
      logger({ level: 'debug', message: 'LDAP unsupported operation' })
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
      logger({ level: 'debug', message: 'LDAP bind request with unsupported version or authentication method' })
      connection.socket.write(ldapResult(messageId, 0x61, RESULT_PROTOCOL_ERROR))
      return
    }

    if (dnEqual(dn, '') && password === '') {
      logger({ level: 'debug', message: 'LDAP bind request with empty DN and password' })
      connection.bindDN = ''
      connection.socket.write(ldapResult(messageId, 0x61, RESULT_SUCCESS))
      return
    }

    if (dnEqual(dn, appConfig.LDAP_BIND_DN)) {
      if (appConfig.LDAP_BIND_PASSWORD
        && appConfig.LDAP_BIND_PASSWORD.length === password.length
        && timingSafeEqual(Buffer.from(password), Buffer.from(appConfig.LDAP_BIND_PASSWORD))) {
        logger({ level: 'debug', message: 'LDAP bind request with valid bind DN and password' })
        connection.bindDN = appConfig.LDAP_BIND_DN
        connection.socket.write(ldapResult(messageId, 0x61, RESULT_SUCCESS))
        return
      }

      logger({ level: 'debug', message: 'LDAP bind request with invalid bind DN or password' })
      connection.socket.write(ldapResult(messageId, 0x61, RESULT_INVALID_CREDENTIALS))
      return
    }

    // not using defined bind dn, check if it is a user
    const userId = await getLDAPUserIdByDN(dn)
    if (!userId || !password || !await checkPasswordHash(userId, password)) {
      logger({ level: 'debug', message: 'LDAP bind request with invalid user credentials' })
      connection.socket.write(ldapResult(messageId, 0x61, RESULT_INVALID_CREDENTIALS))
      return
    }

    const details = await getUserById(userId)
    if (!userCanLogin(details, ['pwd'])) {
      logger({ level: 'debug', message: 'LDAP bind request with user unable to login with only password' })
      connection.socket.write(ldapResult(messageId, 0x61, RESULT_INVALID_CREDENTIALS))
      return
    }

    logger({ level: 'debug', message: 'LDAP bind request with valid user credentials' })
    connection.bindDN = dn
    connection.socket.write(ldapResult(messageId, 0x61, RESULT_SUCCESS))
  } catch (error) {
    logger({
      level: 'debug',
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
      logger({ level: 'debug', message: 'LDAP search denied due to insufficient access' })
      connection.socket.write(ldapResult(messageId, 0x65, RESULT_INSUFFICIENT_ACCESS))
      return
    }

    // Enforce upper bounds on sizeLimit coming from client
    let sizeLimit = req.sizeLimit || MAX_SEARCH_RESULTS
    if (sizeLimit <= 0) {
      sizeLimit = MAX_SEARCH_RESULTS
    }
    sizeLimit = Math.min(sizeLimit, MAX_SEARCH_RESULTS)

    const entries = await getLDAPEntries()
    let sent = 0

    for (const entry of entries) {
      if (sent >= sizeLimit) {
        break
      }

      if (entryInScope(req.baseDN, entry.dn, req.scope) && filterMatches(req.filter, entry.attributes)) {
        connection.socket.write(searchEntry(messageId, entry, req.attributes))
        sent += 1
      }
    }

    logger({ level: 'debug', message: `LDAP search completed, sent ${String(sent)} entries` })
    connection.socket.write(ldapResult(messageId, 0x65, RESULT_SUCCESS))
  } catch (error) {
    logger({
      level: 'debug',
      message: 'LDAP search failed',
      errors: error instanceof Error ? [error] : [{ message: String(error) }],
    })
    connection.socket.write(ldapResult(messageId, 0x65, RESULT_OPERATIONS_ERROR))
  }
}

async function handleCompare(connection: LDAPConnection, messageId: number, op: BERElement) {
  try {
    if (!canSearch(connection)) {
      logger({ level: 'debug', message: 'LDAP compare denied due to insufficient access' })
      connection.socket.write(ldapResult(messageId, 0x6f, RESULT_INSUFFICIENT_ACCESS))
      return
    }

    const req = readCompareRequest(op.value)
    const entry = await getLDAPEntryByDN(req.dn)
    const values = attributeValues(entry?.attributes, req.attribute)
    const result = values.some(value => value === req.value)

    logger({ level: 'debug', message: `LDAP compare completed, result: ${String(result)}` })
    connection.socket.write(ldapResult(messageId, 0x6f, result ? RESULT_COMPARE_TRUE : RESULT_COMPARE_FALSE))
  } catch (error) {
    logger({
      level: 'debug',
      message: 'LDAP compare failed',
      errors: error instanceof Error ? [error] : [{ message: String(error) }],
    })
    connection.socket.write(ldapResult(messageId, 0x6f, RESULT_OPERATIONS_ERROR))
  }
}

function handleExtendedRequest(connection: LDAPConnection, messageId: number, op: BERElement) {
  try {
    const reader = new BERReader(op.value)
    const ext = reader.readElement()

    if (ext.tag !== 0x80) {
      logger({ level: 'debug', message: 'LDAP extended request with invalid tag' })
      connection.socket.write(ldapResult(messageId, 0x61, RESULT_PROTOCOL_ERROR))
      return
    }

    const requestName = ext.value.toString('utf8')
    // Validate that it looks right
    if (!/^\d+(\.\d+)+$/.test(requestName)) {
      logger({ level: 'debug', message: 'LDAP extended request with invalid OID format' })
      connection.socket.write(ldapExtendedResponse(messageId, RESULT_OPERATIONS_ERROR, '', 'Invalid extended request OID'))
      return
    }

    switch (requestName) {
      case '1.3.6.1.4.1.4203.1.11.3': {
        const authzId = connection.bindDN ? `dn:${connection.bindDN}` : ''
        logger({ level: 'debug', message: 'LDAP extended request completed for OID: 1.3.6.1.4.1.4203.1.11.3' })
        connection.socket.write(ldapExtendedResponse(messageId, RESULT_SUCCESS, '', '', undefined, authzId))
        return
      }
      case '1.3.6.1.4.1.1466.20037': {
        logger({ level: 'debug', message: 'LDAP extended request completed for OID: 1.3.6.1.4.1.1466.20037' })
        connection.socket.write(ldapExtendedResponse(messageId, RESULT_OPERATIONS_ERROR, '', 'StartTLS not supported'))
        return
      }
      default: {
        logger({ level: 'debug', message: 'LDAP extended request with unsupported OID' })
        connection.socket.write(ldapExtendedResponse(messageId, RESULT_OPERATIONS_ERROR, '', `Unsupported extended request: ${requestName}`))
        return
      }
    }
  } catch (error) {
    logger({
      level: 'debug',
      message: 'LDAP extended request failed',
      errors: error instanceof Error ? [error] : [{ message: String(error) }],
    })
    connection.socket.write(ldapExtendedResponse(messageId, RESULT_PROTOCOL_ERROR))
  }
}

function ldapExtendedResponse(
  messageId: number,
  resultCode: number,
  matchedDN = '',
  diagnosticMessage = '',
  responseName?: string,
  responseValue?: Buffer | string) {
  const children: Buffer[] = [
    berEnumerated(resultCode),
    berOctetString(matchedDN),
    berOctetString(diagnosticMessage),
  ]

  if (responseName) {
    children.push(berTLV(0x8a, Buffer.from(responseName, 'utf8')))
  }

  if (responseValue !== undefined) {
    const valueBuffer = typeof responseValue === 'string' ? Buffer.from(responseValue, 'utf8') : responseValue
    children.push(berTLV(0x8b, valueBuffer))
  }

  return ldapMessage(messageId, 0x78, children)
}

function canSearch(connection: LDAPConnection) {
  return dnEqual(connection.bindDN, appConfig.LDAP_BIND_DN)
}

function isLDAPSearchScope(scope: string | number): scope is LDAPSearchScope {
  return ['base', 'one', 'sub', 0, 1, 2].includes(scope)
}

function readSearchRequest(value: Buffer): SearchRequest {
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

  const compareRequest = CompareRequestSchema.safeParse({ dn, attribute, value: requestValue })
  if (!compareRequest.success) {
    throw new Error('Invalid compare request')
  }

  return compareRequest.data
}

function readFilter(element: BERElement, depth: number = 0): LDAPFilter {
  const MAX_FILTER_DEPTH = 10
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

  const MAX_SUBSTRING_PARTS = 100
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

  if (length.value > MAX_FRAME_SIZE) {
    throw new Error('LDAP message too large')
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

// BER stands for Basic Encoding Rules
class BERReader {
  private offset = 0

  constructor(private readonly buffer: Buffer) {}

  readAll() {
    const elements: BERElement[] = []

    while (this.offset < this.buffer.length) {
      if (elements.length >= MAX_BER_SEQUENCE_ELEMENTS) {
        throw new Error('BER sequence contains too many elements')
      }
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

    if (element.value.length > MAX_INTEGER_BYTES) {
      throw new Error('Integer too large')
    }

    // convert 4 bytes to a number
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

    if (length.value > MAX_FRAME_SIZE) {
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

  // Prevent too large length values from being processed
  if (value > MAX_FRAME_SIZE) {
    return
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

  // add bytes to array until we have no more remaining value
  do {
    bytes.unshift(remaining & 0xff)
    remaining >>= 8 // shift right by 8 bits to get the next byte
  } while (remaining)

  // if the highest bit of the first byte is set, prepend a 0 byte to indicate a positive number
  if ((bytes[0] ?? 0) & 0x80) {
    bytes.unshift(0)
  }

  return berTLV(0x02, Buffer.from(bytes))
}

// same as berInteger but with tag 0x0a for enumerated type
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

// TLV stands for tag+length+value
function berTLV(tag: number, value: Buffer) {
  return Buffer.concat([Buffer.from([tag]), berLength(value.length), value])
}

function berLength(length: number) {
  // For lengths less than 128, the length is encoded in a single byte
  if (length < 0x80) {
    return Buffer.from([length])
  }

  const bytes: number[] = []
  let remaining = length

  while (remaining) {
    bytes.unshift(remaining & 0xff)
    remaining >>= 8
  }

  // For lengths 128 or greater
  // the length is as a leading byte with the high bit set
  // and the low 7 bits indicating the number of subsequent bytes that encode the length,
  // followed by the length bytes
  return Buffer.from([0x80 | bytes.length, ...bytes])
}
