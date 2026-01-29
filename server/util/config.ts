import { generate } from 'generate-password'
import { exit } from 'node:process'
import { booleanString } from './util'
import { logger } from './logger'
import * as psl from 'psl'

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

  // SMTP
  SMTP_HOST?: string
  SMTP_FROM?: string
  SMTP_PORT = 587
  SMTP_SECURE = false
  SMTP_USER?: string
  SMTP_PASS?: string
  SMTP_IGNORE_CERT: boolean = false
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
      appConfig[key] = stringDuration(value) ?? (booleanString(value) === false ? null : 3600) ?? appConfig[key]
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
      appConfig[key] = stringOnly(value) ?? appConfig[key]
      break

    // non default pos int variables
    case 'DB_PORT':
    case 'MIGRATE_TO_DB_PORT':
      appConfig[key] = posInt(value) ?? appConfig[key]
      break

    // The default case for all string config values
    default:
      appConfig[key] = stringOnly(value) ?? appConfig[key]
      break
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

/**
 * Validations and Coercions
 */

// make sure APP_URL does not have trailing slash(es)
appConfig.APP_URL = appConfig.APP_URL.replace(/\/+$/, '')

// check APP_URL is set
if (!appConfig.APP_URL || !URL.parse(appConfig.APP_URL)) {
  logger.error('APP_URL must be set and be a valid URL, starting with http(s)://')
  exit(1)
}

// If APP_URL hostname seems to be a private dns zone, debug log that
const pslParsedAppUrl = psl.parse(appUrl().hostname)
if ('listed' in pslParsedAppUrl && !pslParsedAppUrl.listed) {
  logger.debug(`APP_URL: '${appConfig.APP_URL}' appears to be a private DNS zone.`)
}

// If SESSION_DOMAIN is set, make sure APP_URL endsWith SESSION_DOMAIN
if (appConfig.SESSION_DOMAIN) {
  const dotSD = (!appConfig.SESSION_DOMAIN.startsWith('.') ? '.' : '') + appConfig.SESSION_DOMAIN
  if (appUrl().hostname !== appConfig.SESSION_DOMAIN && !appUrl().hostname.endsWith(dotSD)) {
    logger.error('If SESSION_DOMAIN is set, the APP_URL hostname must end with the SESSION_DOMAIN.')
    exit(1)
  }
  if (appConfig.SESSION_DOMAIN !== getBaseDomain(appUrl().hostname)) {
    logger.debug(`SESSION_DOMAIN: '${appConfig.SESSION_DOMAIN}'`)
  }
}
logger.debug(`Session Domain: '${String(getSessionDomain())}'`)

// check DEFAULT_REDIRECT is valid if set
if (appConfig.DEFAULT_REDIRECT && !URL.parse(appConfig.DEFAULT_REDIRECT)) {
  logger.error('DEFAULT_REDIRECT must be a valid URL starting with http(s):// if it is set.')
  exit(1)
}

// check that STORAGE_KEY is set
if (appConfig.STORAGE_KEY.length < 32) {
  logger.error('STORAGE_KEY must be set and be at least 32 characters long. Use something long and random like: ')
  logger.error(generate({
    length: 32,
    numbers: true,
  }))
  exit(1)
}

// check PASSWORD_STRENGTH is between 0 and 4
if (appConfig.PASSWORD_STRENGTH < 0 || appConfig.PASSWORD_STRENGTH > 4) {
  console.error('PASSWORD_STRENGTH must be between 0 and 4.')
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
  const targetDomain = getBaseDomain(hostName)
  const sessionDomain = getSessionDomain()
  return targetDomain === sessionDomain || (sessionDomain != null && hostName.endsWith(sessionDomain))
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
