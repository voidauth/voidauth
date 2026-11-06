import fs from 'node:fs'
import net, { type Socket } from 'node:net'
import tls from 'node:tls'
import appConfig from '../util/config'
import { logger, purgeAsyncLog } from '../util/logger'
import { checkPasswordHash } from '../db/user'
import { userCanLogin } from '../util/auth'
import {
  dnEqual,
  entryInScope,
  getEntryJpegPhoto,
  getLDAPEntries,
  getLDAPEntryByDN,
  getLDAPUserIdByDN,
  type LDAPEntry,
  MAX_SEARCH_RESULTS,
  searchScope,
} from './directory'
import { timingSafeEqual } from 'node:crypto'
import { als } from '../util/als'
import {
  BERReader,
  MAX_FRAME_SIZE,
  berEnumerated,
  berInteger,
  berOctetString,
  berSequence,
  berSet,
  berTLV,
  readLength,
  type BERElement,
} from './ber'
import {
  filterMatches,
  filterReferencesAttribute,
  requestsAttribute,
  selectedAttributes,
  stringAttributeValues,
} from './filter'
import { readCompareRequest, readSearchRequest, type SearchRequest } from './request'

const RESULT_SUCCESS = 0
const RESULT_OPERATIONS_ERROR = 1
const RESULT_COMPARE_FALSE = 5
const RESULT_COMPARE_TRUE = 6
const RESULT_PROTOCOL_ERROR = 2
const RESULT_INVALID_CREDENTIALS = 49
const RESULT_INSUFFICIENT_ACCESS = 50

// Security limits
const MAX_BUFFER_SIZE = 256 * 1024 // 256 KiB per connection buffer
// Close connections that are idle for 5 minutes
const IDLE_TIMEOUT_MS = 5 * 60 * 1000

type LDAPConnection = {
  bindDN: string
  buffer: Buffer
  socket: Socket
}

type LDAPMessage = {
  id: number
  op: BERElement
}

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

  let processing = Promise.resolve()

  // Kill idle connections
  socket.setTimeout(IDLE_TIMEOUT_MS)
  socket.on('timeout', () => {
    logger({ level: 'debug', message: 'LDAP connection idle timeout; closing connection' })
    socket.destroy()
  })

  socket.on('data', (chunk) => {
    als.run({}, () => {
      if (connection.buffer.length + chunk.length > MAX_BUFFER_SIZE) {
        logger({ level: 'debug', message: 'LDAP client sent too much data; closing connection' })
        connection.socket.write(ldapResult(0, 0x61, RESULT_OPERATIONS_ERROR, '', 'Frame too large'))
        connection.socket.destroy()
        return
      }

      connection.buffer = Buffer.concat([connection.buffer, chunk])
      // Only handle next after previous finishes
      processing = processing
        .then(() => als.run({}, () => processBuffer(connection)))
        .catch((error: unknown) => {
          logger({
            level: 'debug',
            message: 'LDAP message processing failed',
            errors: error instanceof Error ? [error] : [{ message: String(error) }],
          })
          connection.socket.destroy()
        })
        .then(() => {
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
      // Incomplete frame
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
    const user = await getLDAPUserIdByDN(dn)
    if (!user || !password || !await checkPasswordHash(user.id, password)) {
      logger({ level: 'debug', message: 'LDAP bind request with invalid user credentials' })
      connection.socket.write(ldapResult(messageId, 0x61, RESULT_INVALID_CREDENTIALS))
      return
    }

    if (!userCanLogin(user, ['pwd'])) {
      logger({ level: 'debug', message: 'LDAP bind request with user unable to login with a password' })
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

    const sizeLimit = req.sizeLimit > 0 ? Math.min(req.sizeLimit, MAX_SEARCH_RESULTS) : MAX_SEARCH_RESULTS

    let sent = 0
    for (const entry of await getLDAPEntries()) {
      if (sent >= sizeLimit) {
        break
      }

      const resolved = await resolveSearchEntry(entry, req)
      if (!resolved) {
        continue
      }

      connection.socket.write(searchEntry(messageId, resolved, req.attributes))
      sent += 1
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
    const values = stringAttributeValues(entry?.attributes, req.attribute)
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

// Make copy of entry including jpegphoto if possible
async function withJpegPhoto(entry: LDAPEntry): Promise<LDAPEntry> {
  const jpegPhoto = await getEntryJpegPhoto(entry)
  return jpegPhoto ? { ...entry, attributes: { ...entry.attributes, jpegPhoto } } : entry
}

// Check whether an entry should be returned for given search request
async function resolveSearchEntry(entry: LDAPEntry, req: SearchRequest): Promise<LDAPEntry | undefined> {
  if (!entryInScope(req.baseDN, entry.dn, req.scope)) {
    return undefined
  }

  // check if jpegphoto can be lazy loaded or if the filter references it
  const photoFilter = filterReferencesAttribute(req.filter, 'jpegPhoto')
  let resolved = photoFilter ? await withJpegPhoto(entry) : entry

  if (!filterMatches(req.filter, resolved.attributes)) {
    return undefined
  }

  // entry matches request! Get the jpegphoto if we haven't already
  if (requestsAttribute(req.attributes, 'jpegPhoto') && !photoFilter) {
    resolved = await withJpegPhoto(resolved)
  }

  return resolved
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
