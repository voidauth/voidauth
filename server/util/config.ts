import 'dotenv/config'
import * as path from 'node:path'

// an exception
const CONFIG_DIR = process.env.CONFIG_DIR || './config'

// basic config for app
class Config {
  // read-only
  CONFIG_DIR = CONFIG_DIR
  EMAIL_TEMPLATE_DIR = path.join(CONFIG_DIR, "email_templates")
  BRANDING_DIR = path.join(CONFIG_DIR, "branding")
  THEME_DIR = "./theme"

  PORT = '80'
  APP_TITLE = 'unknown' // TODO: come up with an app name
  APP_DOMAIN = 'http://localhost'

  SQLITE_DIR = './db'

  SIGNUP = false
  SIGNUP_REQUIRES_APPROVAL = true

  PRIMARY_COLOR = '#8864c4'
  PRIMARY_CONTRAST_COLOR = 'white' // TODO: get this from generated theme

  EMAIL_VERIFICATION = false

  SMTP_HOST?: string
  SMTP_FROM?: string
  SMTP_PORT = 587
  SMTP_SECURE = false
  SMTP_USER?: string
  SMTP_PASS?: string
}
const appConfig = new Config

function assignConfigValue(key: keyof Config, value: unknown) {
  switch (key) {
    // read only variables
    case "CONFIG_DIR":
    case "EMAIL_TEMPLATE_DIR":
    case "BRANDING_DIR":
    case "THEME_DIR":
      break

    // non-string variables
    case "SMTP_PORT":
      appConfig[key] = posInt(value) ?? appConfig[key]
      break
    case "SMTP_SECURE":
      appConfig[key] = booleanString(value) ?? appConfig[key]
      break
    case "EMAIL_VERIFICATION":
      appConfig[key] = booleanString(value) ?? appConfig[key]
      break
    case "SIGNUP":
      appConfig[key] = booleanString(value) ?? appConfig[key]
      break
    case "SIGNUP_REQUIRES_APPROVAL":
      appConfig[key] = booleanString(value) ?? appConfig[key]
      break

    // default null variables
    case "SMTP_HOST":
      appConfig[key] = stringOnly(value) ?? appConfig[key]
      break
    case "SMTP_FROM":
      appConfig[key] = stringOnly(value) ?? appConfig[key]
      break
    case "SMTP_USER":
      appConfig[key] = stringOnly(value) ?? appConfig[key]
      break
    case "SMTP_PASS":
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
  if (typeof value === "string") {
    return value
  }

  return null
}

function posInt(value: unknown): number | null {
  return typeof value === "string" && Number.isInteger(Number.parseFloat(value)) && Number.parseInt(value) > 0 ?
    Number.parseInt(value) :
    null
}

function booleanString(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true
    } else if (value.toLowerCase() === "false") {
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

export default appConfig 