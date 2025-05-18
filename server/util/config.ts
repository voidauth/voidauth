import { generate } from "generate-password"
import { exit } from "node:process"

// NODE_ENV defaults to 'production' if not set
process.env.NODE_ENV ??= "production"

// basic config for app
class Config {
  APP_TITLE = "void-auth"
  APP_DOMAIN = ""

  SIGNUP = false
  SIGNUP_REQUIRES_APPROVAL = true
  EMAIL_VERIFICATION = false

  APP_COLOR = "#8864c4"

  // Database config
  DB_PASSWORD?: string // checked for validity
  DB_HOST?: string
  DB_PORT: number = 5432
  DB_USER: string = "postgres"
  DB_NAME: string = "postgres"

  // connectionString: config.DATABASE_URL,
  //   host: config['DB_HOST'],
  //   port: config['DB_PORT'],
  //   user: config['DB_USER'],
  //   database: config['DB_NAME'],
  //   password: config['DB_PASSWORD'],
  //   ssl: config['DB_SSL'] ? { rejectUnauthorized: false } : false,

  // required and checked for validity
  STORAGE_KEY: string = ""

  // Optional
  STORAGE_KEY_SECONDARY?: string
  ZXCVBN_MIN = 2

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
    case "SMTP_PORT":
    case "DB_PORT":
    case "ZXCVBN_MIN":
      appConfig[key] = posInt(value) ?? appConfig[key]
      break

    // booleans
    case "SMTP_SECURE":
    case "EMAIL_VERIFICATION":
    case "SIGNUP":
    case "SIGNUP_REQUIRES_APPROVAL":
      appConfig[key] = booleanString(value) ?? appConfig[key]
      break

    // non default variables
    case "STORAGE_KEY_SECONDARY":
    case "DB_HOST":
    case "DB_PASSWORD":
    case "SMTP_HOST":
    case "SMTP_FROM":
    case "SMTP_USER":
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
  return typeof value === "string" && Number.isInteger(Number.parseFloat(value)) && Number.parseInt(value) > 0
    ? Number.parseInt(value)
    : null
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

// check APP_DOMAIN is set
if (!appConfig.APP_DOMAIN || !URL.parse(appConfig.APP_DOMAIN)) {
  console.error("APP_DOMAIN must be set and be a valid URL.")
  exit(1)
}

// check that STORAGE_KEY is set
if (appConfig.STORAGE_KEY.length < 32) {
  console.error("STORAGE_KEY must be set and be at least 32 characters long. Use something long and random like: ")
  console.error(generate({
    length: 32,
    numbers: true,
  }))
  exit(1)
}

// check ZXCVBN_MIN is between 2 and 4
if (appConfig.ZXCVBN_MIN < 2 || appConfig.ZXCVBN_MIN > 4) {
  console.error("ZXCVBN_MIN must be between 2 and 4.")
  exit(1)
}

export default appConfig
