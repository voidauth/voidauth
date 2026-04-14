import { exit } from 'node:process'
import { booleanString } from './util'
import { logger } from './logger'
import * as psl from 'psl'
import type { ClientResponse } from '@shared/api-response/ClientResponse.js'
import Docker from 'dockerode'
import { clientUpsertValidator } from '@shared/api-request/admin/ClientUpsert'
import zod from 'zod'
import type { SecureVersion } from 'node:tls'
import { randomBytes } from 'node:crypto'

// basic config for app
class Config {
  APP_TITLE = 'VoidAuth'
  APP_URL = ''
  APP_PORT: number | string = 3000

  SESSION_DOMAIN?: string

  SIGNUP = false
  SIGNUP_REQUIRES_APPROVAL = true
  EMAIL_VERIFICATION: boolean | null = null
  MFA_REQUIRED: boolean = false

  APP_COLOR = '#906bc7'
  APP_FONT = ''

  // Database config
  DB_ADAPTER = 'postgres'
  DB_PASSWORD?: string // checked for validity
  DB_HOST?: string
  DB_PORT?: number
  DB_USER?: string
  DB_NAME?: string
  DB_SSL: boolean = false
  DB_SSL_VERIFICATION: boolean = true

  // Database migration config
  MIGRATE_TO_DB_ADAPTER = 'postgres'
  MIGRATE_TO_DB_PASSWORD?: string
  MIGRATE_TO_DB_HOST?: string
  MIGRATE_TO_DB_PORT?: number
  MIGRATE_TO_DB_USER?: string
  MIGRATE_TO_DB_NAME?: string
  MIGRATE_TO_DB_SSL: boolean = false
  MIGRATE_TO_DB_SSL_VERIFICATION: boolean = true

  // required and checked for validity
  STORAGE_KEY: string = ''

  // Optional
  STORAGE_KEY_SECONDARY?: string
  PASSWORD_STRENGTH = 3
  API_RATELIMIT = 60
  DEFAULT_REDIRECT?: string
  CONTACT_EMAIL?: string
  ADMIN_EMAILS?: number
  DEFAULT_USER_EXPIRES_IN?: number

  // SMTP
  SMTP_HOST?: string
  SMTP_FROM?: string
  SMTP_PORT = 587
  SMTP_SECURE = false
  SMTP_USER?: string
  SMTP_PASS?: string
  SMTP_IGNORE_CERT: boolean = false
  SMTP_TLS_CIPHERS?: string
  SMTP_TLS_MIN_VERSION?: SecureVersion

  DECLARED_CLIENTS = new Map<string, ClientResponse>()
}

const appConfig = new Config()

function assignConfigValue(key: keyof Config, value: string | undefined) {
  switch (key) {
    // positive ints
    case 'SMTP_PORT':
    case 'PASSWORD_STRENGTH':
    case 'API_RATELIMIT':
      appConfig[key] = posInt(value) ?? appConfig[key]
      break

    // APP_PORT must be a positive integer or a non-empty string (for unix socket)
    case 'APP_PORT':
      appConfig[key] = posInt(value) ?? (stringOnly(value) || null) ?? appConfig[key]
      break

    case 'ADMIN_EMAILS':
      appConfig[key] = stringDuration(value) ?? posInt(value) ?? (booleanString(value) === false ? null : 3600) ?? appConfig[key]
      break

    case 'DEFAULT_USER_EXPIRES_IN':
      appConfig[key] = stringDuration(value) ?? posInt(value) ?? appConfig[key]
      break

    // booleans
    case 'SMTP_SECURE':
    case 'SMTP_IGNORE_CERT':
    case 'SIGNUP':
    case 'SIGNUP_REQUIRES_APPROVAL':
    case 'MFA_REQUIRED':
    case 'DB_SSL':
    case 'DB_SSL_VERIFICATION':
    case 'MIGRATE_TO_DB_SSL':
    case 'MIGRATE_TO_DB_SSL_VERIFICATION':
      appConfig[key] = booleanString(value) ?? appConfig[key]
      break

    case 'EMAIL_VERIFICATION':
      appConfig[key] = booleanString(value) ?? appConfig[key]
      break

    // non default variables
    case 'SESSION_DOMAIN':
    case 'STORAGE_KEY_SECONDARY':
    case 'DEFAULT_REDIRECT':
    case 'CONTACT_EMAIL':
    case 'DB_HOST':
    case 'DB_PASSWORD':
    case 'DB_NAME':
    case 'DB_USER':
    case 'MIGRATE_TO_DB_PASSWORD':
    case 'MIGRATE_TO_DB_HOST':
    case 'MIGRATE_TO_DB_USER':
    case 'MIGRATE_TO_DB_NAME':
    case 'SMTP_HOST':
    case 'SMTP_FROM':
    case 'SMTP_USER':
    case 'SMTP_PASS':
    case 'SMTP_TLS_CIPHERS':
      appConfig[key] = stringOnly(value) ?? appConfig[key]
      break

    case 'SMTP_TLS_MIN_VERSION':
      appConfig[key] = ['TLSv1.3', 'TLSv1.2', 'TLSv1.1', 'TLSv1'].includes(stringOnly(value) as SecureVersion)
        ? value as SecureVersion
        : appConfig[key]
      break

    // non default pos int variables
    case 'DB_PORT':
    case 'MIGRATE_TO_DB_PORT':
      appConfig[key] = posInt(value) ?? appConfig[key]
      break

    case 'DECLARED_CLIENTS':
      break

    // The default case for all string config values
    default:
      appConfig[key] = stringOnly(value) ?? appConfig[key]
      break
  }
}

async function registerDockerListener(): Promise<Docker | undefined> {
  try {
    const docker = new Docker()
    const stream = await docker.getEvents({ filters: { type: ['container'], event: ['start', 'stop', 'restart', 'die'] } })
    stream.on('data', () => {
      refreshDeclaredClients(docker)
    })
    return docker
  } catch { /* do nothing, docker not initialized */ }
}

function refreshDeclaredClients(docker: Docker | undefined) {
  // Use separate map to prevent DECLARED_CLIENTS map from being empty during a container start/stop/restart/etc.
  const clients = new Map<string, ClientResponse>()

  // Inspect docker container labels to find OIDC client configs
  if (docker !== undefined) {
    docker.listContainers(async (_err, containers) => {
      if (!containers) return

      for (const { Id } of containers) {
        const info = await docker.getContainer(Id).inspect()
        if (!info.State.Running || info.Config.Labels['voidauth.enable'] !== 'true') continue

        for (const [rawKey, value] of Object.entries(info.Config.Labels)) {
          const key = rawKey.toLowerCase()
          if (!key.startsWith('voidauth.oidc.')) continue
          const [, , client_id, variable] = key.split('.', 4)
          if (!client_id || !variable) continue
          registerClientVariable(clients, client_id, variable, value, 'label')
        }
      }
    })
  }

  // Inspect environment variables to find OIDC client configs
  Object.keys(process.env).forEach((key) => {
    const raw = key.split('_')
    if (raw.length < 3 || raw[0] !== 'OIDC') return

    const parts = [
      raw[0],
      raw[1],
      raw.slice(2).join('_'),
    ]

    const client_id = parts[1]
    const value = process.env[key]
    const variable = parts[2]
    if (client_id === undefined || variable === undefined || value === undefined) return

    registerClientVariable(clients, client_id, variable, value, 'env')
  })

  appConfig.DECLARED_CLIENTS = clients
}

function registerClientVariable(clients: Map<string, ClientResponse>,
  client_id: string,
  variable: string,
  value: string,
  source: 'env' | 'label') {
  // Skip when value is empty
  if (!value) {
    return
  }

  // Helper function to validate client variables
  const validateClientVar = <T, I extends string | string []>(input: I,
    validator: zod.ZodType<T, I | undefined | null>) => {
    const validated = validator.safeParse(input)
    if (validated.error) {
      throw new Error(zod.prettifyError(validated.error))
    }
    return validated.data
  }

  try {
    validateClientVar(client_id, clientUpsertValidator.client_id)

    let client = clients.get(client_id)
    if (!client) {
      client = {
        client_id: client_id,
        token_endpoint_auth_method: 'client_secret_basic',
        response_types: ['code'],
        grant_types: ['authorization_code', 'refresh_token'],
        groups: [],
        skip_consent: false,
        declared: source,
      }
      clients.set(client_id, client)
    }

    value = value.trim()

    // Check that the values are valid, and if so use them
    switch (variable.toUpperCase()) {
      case 'CLIENT_DISPLAY_NAME':
        client.client_name = validateClientVar(value, clientUpsertValidator.client_name)
        break
      case 'CLIENT_HOMEPAGE_URL':
        client.client_uri = validateClientVar(value, clientUpsertValidator.client_uri)
        break
      case 'CLIENT_LOGO_URL':
        client.logo_uri = validateClientVar(value, clientUpsertValidator.logo_uri)
        break
      case 'CLIENT_SECRET':
        client.client_secret = validateClientVar(value, clientUpsertValidator.client_secret)
        break
      case 'CLIENT_AUTH_METHOD':
        client.token_endpoint_auth_method = validateClientVar(value, clientUpsertValidator.token_endpoint_auth_method)
        break
      case 'CLIENT_GROUPS':
        client.groups = validateClientVar(value.split(',').map(v => v.trim()), clientUpsertValidator.groups)
        break
      case 'CLIENT_REDIRECT_URLS':
        client.redirect_uris = validateClientVar(value.split(',').map(v => v.trim()), clientUpsertValidator.redirect_uris)
        break
      case 'CLIENT_RESPONSE_TYPES':
        client.response_types = validateClientVar(value.split(',').map(v => v.trim()), clientUpsertValidator.response_types)
        break
      case 'CLIENT_GRANT_TYPES':
        client.grant_types = validateClientVar(value.split(',').map(v => v.trim()), clientUpsertValidator.grant_types)
        break
      case 'CLIENT_POST_LOGOUT_URLS':
        client.post_logout_redirect_uris = [validateClientVar(value, clientUpsertValidator.post_logout_redirect_uri.unwrap().unwrap())]
        break
      case 'CLIENT_SKIP_CONSENT':
        client.skip_consent = validateClientVar(value, zod.stringbool())
        break
    }
  } catch (e) {
    // Log error then continue
    logger({
      level: 'error',
      message: 'Error processing declared client variable',
      details: {
        declared_client: {
          client_id,
          source,
          variable,
          value,
        },
      },
      errors: e instanceof Error ? [e] : [{ message: String(e) }],
    })
  }
}

// functions to help format config
function stringOnly(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  return null
}

function posInt(value: unknown): number | null {
  return typeof value === 'string' && Number.isInteger(Number.parseFloat(value)) && Number.parseInt(value) > 0
    ? Number.parseInt(value)
    : null
}

function stringDuration(durationStr: unknown) {
  if (typeof durationStr !== 'string') {
    return
  }

  // Mapping of time units to their equivalent in seconds
  const unitMap = {
    // Singular and plural forms
    minute: 60,
    hour: 3600,
    day: 86400,
    week: 604800,
    month: 2592000, // Approximating a month as 30 days
    year: 31536000, // Approximating a year as 365 days

    daily: 86400,
  } as const

  // Normalize the input string
  const normalized = durationStr.toLowerCase().trim()

  // Check for direct frequency matches
  if (Object.keys(unitMap).includes(normalized)) {
    return unitMap[normalized as keyof typeof unitMap]
  }

  // Parse numeric durations with units
  const matchNumeric = normalized.match(/(\d+)\s*(minute|hour|day|week|month|year)s?/)
  if (matchNumeric) {
    const [, numberStr, unit] = matchNumeric
    if (numberStr && unit) {
      const number = parseInt(numberStr, 10)

      if (Object.keys(unitMap).includes(unit)) {
        return number * unitMap[unit as keyof typeof unitMap]
      }
    }
  }

  // Parse unit durations directly, or ending with 'ly'
  const matchDirect = normalized.match(/(minute|hour|week|month|year)ly?/)
  if (matchDirect) {
    const [, unit] = matchDirect
    if (unit) {
      if (Object.keys(unitMap).includes(unit)) {
        return unitMap[unit as keyof typeof unitMap]
      }
    }
  }

  return
}

const configKeys = Object.getOwnPropertyNames(appConfig) as (keyof Config)[]

// read from process env vars
configKeys.forEach((key: keyof Config) => {
  assignConfigValue(key, process.env[key])
})

refreshDeclaredClients(await registerDockerListener())

/**
 * Validations and Coercions
 */

// make sure APP_URL does not have trailing slash(es)
appConfig.APP_URL = appConfig.APP_URL.replace(/\/+$/, '')

// check APP_URL is set
if (!appConfig.APP_URL || !URL.parse(appConfig.APP_URL)) {
  logger({
    level: 'error',
    message: 'APP_URL must be set and be a valid URL starting with http(s)://',
  })
  exit(1)
}

// If APP_URL hostname seems to be a private dns zone, debug log that
const pslParsedAppUrl = psl.parse(appUrl().hostname)
if ('listed' in pslParsedAppUrl && !pslParsedAppUrl.listed) {
  logger({
    level: 'debug',
    message: `APP_URL: '${appConfig.APP_URL}' appears to be a private DNS zone.`,
  })
}

logger({
  level: 'debug',
  message: `Session Domain: '${String(getSessionDomain())}'`,
})

// If SESSION_DOMAIN is set, make sure SESSION_DOMAIN cookies reach APP_URL
if (appConfig.SESSION_DOMAIN) {
  if (!sessionDomainReaches(appUrl().hostname)) {
    logger({
      level: 'error',
      message: 'If SESSION_DOMAIN is set, the APP_URL hostname must end with the SESSION_DOMAIN.',
    })
    exit(1)
  }
}

// check DEFAULT_REDIRECT is valid if set
if (appConfig.DEFAULT_REDIRECT && !URL.parse(appConfig.DEFAULT_REDIRECT)) {
  logger({
    level: 'error',
    message: 'DEFAULT_REDIRECT must be a valid URL starting with http(s):// if it is set.',
  })
  exit(1)
}

// check that STORAGE_KEY is set
if (appConfig.STORAGE_KEY.length < 32) {
  logger({
    level: 'error',
    message: 'STORAGE_KEY must be set and be at least 32 characters long. Use something long and random like: '
      + randomBytes(24).toString('base64url'),
  })
  exit(1)
}

// check PASSWORD_STRENGTH is between 0 and 4
if (appConfig.PASSWORD_STRENGTH < 0 || appConfig.PASSWORD_STRENGTH > 4) {
  logger({
    level: 'error',
    message: 'PASSWORD_STRENGTH must be between 0 and 4.',
  })
  exit(1)
}

// If EMAIL_VALIDATION is unset, give it a default value
if (appConfig.EMAIL_VERIFICATION == null) {
  appConfig.EMAIL_VERIFICATION = !!appConfig.SMTP_HOST
}

// Make sure APP_FONT, if set, is in the proper format
appConfig.APP_FONT = appConfig.APP_FONT.trim()
if (appConfig.APP_FONT) {
  if (!appConfig.APP_FONT.endsWith(',')) {
    appConfig.APP_FONT += ','
  }
  appConfig.APP_FONT += ' '
}

//
// Exported Utility Functions
//

export function appUrl(): URL {
  return URL.parse(appConfig.APP_URL) as URL
}

export function basePath() {
  return appUrl().pathname.replace(/\/$/, '')
}

export function getSessionDomain() {
  return appConfig.SESSION_DOMAIN || getBaseDomain(appUrl().hostname)
}

export function sessionDomainReaches(hostName: string) {
  const targetDomain = getBaseDomain(hostName) || hostName
  const sessionDomain = getSessionDomain() || appUrl().hostname
  // Add dot to start of sessionDomain if it doesn't already have one, to prevent false positives
  const dotSD = !sessionDomain.startsWith('.') ? '.' + sessionDomain : sessionDomain
  return targetDomain === sessionDomain || hostName.endsWith(dotSD)
}

//
// Utility Functions
//

function getBaseDomain(hostname: string) {
  return psl.get(hostname) ?? undefined
}

//
// Default Export
//

export default appConfig
