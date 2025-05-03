import { exit } from 'node:process'

// NODE_ENV defaults to 'production' if not set
process.env.NODE_ENV ??= 'production'

// basic config for app
class Config {
  PORT = '80'
  APP_TITLE = 'void-auth'
  APP_DOMAIN = 'http://localhost'

  SQLITE_DIR = './db'

  SIGNUP = false
  SIGNUP_REQUIRES_APPROVAL = true

  PRIMARY_COLOR = '#8864c4'
  PRIMARY_CONTRAST_COLOR = 'white' // TODO: get this from generated theme

  EMAIL_VERIFICATION = false

  // required and checked for validity
  STORAGE_KEY: string = ''

  // Optional
  STORAGE_KEY_SECONDARY?: string
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
    case 'SMTP_PORT':
      appConfig[key] = posInt(value) ?? appConfig[key]
      break

    // booleans
    case 'SMTP_SECURE':
    case 'EMAIL_VERIFICATION':
    case 'SIGNUP':
    case 'SIGNUP_REQUIRES_APPROVAL':
      appConfig[key] = booleanString(value) ?? appConfig[key]
      break

    // required variables
    case 'STORAGE_KEY':
      appConfig[key] = stringOnly(value) ?? appConfig[key]
      break

    // default null variables
    case 'STORAGE_KEY_SECONDARY':
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

// check that STORAGE_KEY is set
if (appConfig.STORAGE_KEY.length < 32) {
  console.error('STORAGE_KEY must be set and be at least 32 characters long.')
  exit(1)
}

export default appConfig
