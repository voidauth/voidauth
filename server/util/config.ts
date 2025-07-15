import { generate } from 'generate-password'
import { exit } from 'node:process'

// NODE_ENV defaults to 'production' if not set
process.env.NODE_ENV ??= 'production'

// basic config for app
class Config {
  APP_TITLE = 'VoidAuth'
  APP_URL = ''
  APP_PORT = 3000

  SIGNUP = false
  SIGNUP_REQUIRES_APPROVAL = true
  EMAIL_VERIFICATION = false

  APP_COLOR = '#906bc7'

  // Database config
  DB_PASSWORD?: string // checked for validity
  DB_HOST?: string
  DB_PORT: number = 5432
  DB_USER: string = 'postgres'
  DB_NAME: string = 'postgres'

  // required and checked for validity
  STORAGE_KEY: string = ''

  // Optional
  STORAGE_KEY_SECONDARY?: string
  PASSWORD_STRENGTH = 2
  DEFAULT_REDIRECT?: string
  CONTACT_EMAIL?: string

  // SMTP
  SMTP_HOST?: string
  SMTP_FROM?: string
  SMTP_PORT = 587
  SMTP_SECURE = false
  SMTP_USER?: string
  SMTP_PASS?: string
}
const appConfig = new Config()

function assignConfigValue(key: keyof Config, value: unknown) {
  switch (key) {
    // positive ints
    case 'APP_PORT':
    case 'SMTP_PORT':
    case 'DB_PORT':
    case 'PASSWORD_STRENGTH':
      appConfig[key] = posInt(value) ?? appConfig[key]
      break

    // booleans
    case 'SMTP_SECURE':
    case 'EMAIL_VERIFICATION':
    case 'SIGNUP':
    case 'SIGNUP_REQUIRES_APPROVAL':
      appConfig[key] = booleanString(value) ?? appConfig[key]
      break

    // non default variables
    case 'STORAGE_KEY_SECONDARY':
    case 'DEFAULT_REDIRECT':
    case 'CONTACT_EMAIL':
    case 'DB_HOST':
    case 'DB_PASSWORD':
    case 'SMTP_HOST':
    case 'SMTP_FROM':
    case 'SMTP_USER':
    case 'SMTP_PASS':
      appConfig[key] = stringOnly(value) ?? appConfig[key]
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

function booleanString(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true
    } else if (value.toLowerCase() === 'false') {
      return false
    }
  }

  return null
}

const configKeys = Object.getOwnPropertyNames(appConfig) as (keyof Config)[]

// read from process env vars
configKeys.forEach((key: keyof Config) => {
  assignConfigValue(key, process.env[key])
})

// check APP_URL is set
if (!appConfig.APP_URL || !URL.parse(appConfig.APP_URL)) {
  console.error('APP_URL must be set and be a valid URL, starting with http(s)://')
  exit(1)
}

// check DEFAULT_REDIRECT is valid if set
if (appConfig.DEFAULT_REDIRECT && !URL.parse(appConfig.DEFAULT_REDIRECT)) {
  console.error('DEFAULT_REDIRECT must be a valid URL starting with http(s):// if it is set.')
  exit(1)
}

// check that STORAGE_KEY is set
if (appConfig.STORAGE_KEY.length < 32) {
  console.error('STORAGE_KEY must be set and be at least 32 characters long. Use something long and random like: ')
  console.error(generate({
    length: 32,
    numbers: true,
  }))
  exit(1)
}

// check PASSWORD_STRENGTH is between 2 and 4
if (appConfig.PASSWORD_STRENGTH < 0 || appConfig.PASSWORD_STRENGTH > 4) {
  console.error('PASSWORD_STRENGTH must be between 0 and 4.')
  exit(1)
}

export default appConfig
