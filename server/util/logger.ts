import { booleanString } from './util'
import { als } from './als'

export type LogShape = {
  // debug logs are only printed when ENABLE_DEBUG is true
  // error logs are reserved for configuration or runtime errors, and always printed
  level: 'debug' | 'info' | 'error'
  timestamp?: number
  message: string
  request?: {
    ip?: string
    method: string
    path: string
  }
  response?: {
    statusCode: number
    location?: string // 3xx redirect location
  }
  user?: {
    id: string
    username: string
    source: string
    amr: string[] // OIDC Authentication Methods Reference
  }
  // auth factor added to user
  authentication?: {
    user_id: string
    username: string
    amr: string[]
    remember?: boolean
  }
  // interaction details for OIDC login flow
  interaction?: {
    prompt: string
    reasons: string[]
    client_id: string
    redirect_uri: string
  }
  proxyauth?: {
    action?: string
    reason?: string
    url?: string
    urlDomain?: string
    matchedDomain?: string
    domainGroups?: string[]
  }
  // zod validations errors for API requests
  api_validation?: {
    error: Record<string, unknown>
  }
  declared_client?: {
    client_id?: string
    source?: string
    variable?: string
    value?: string
  }
  errors?: {
    name?: string
    message?: string
  }[]
}

export function logger(log: LogShape) {
  if (!log.timestamp) {
    log = { timestamp: Date.now(), ...log }
  }

  if (log.errors) {
    log.errors = log.errors.map((e) => {
      return {
        name: e.name,
        message: e.message,
      }
    })
  }

  // Store the log in the ALS context if it exists
  // If a log already exists in the context, deep merge the two logs, with the new log taking precedence
  // higher log levels take precedence (error > info > debug)
  const store = als.getStore()

  if (!store) {
    printLog(log)
    return log
  }

  if (!store.log) {
    store.log = log
  } else {
    const earlierTimestamp = store.log.timestamp && log.timestamp
      ? Math.min(store.log.timestamp, log.timestamp)
      : log.timestamp || store.log.timestamp

    const errors = store.log.errors && log.errors ? store.log.errors.concat(log.errors) : store.log.errors || log.errors

    store.log = {
      // merge the two logs, with the new log taking precedence
      ...store.log, ...log,
      // earlier timestamp takes precedence
      timestamp: earlierTimestamp,
      // errors are combined
      errors,
    }
  }
  return log // do not print the log immediately, it will be printed when purgeAsyncLog is called
}

export function purgeAsyncLog() {
  const store = als.getStore()
  if (store?.log) {
    printLog(store.log)
    delete store.log
  }
}

function printLog(log: LogShape) {
  switch (log.level) {
    case 'debug':
      if (booleanString(process.env.ENABLE_DEBUG)) {
        console.log(format(log))
      }
      break
    case 'info':
      console.log(format(log))
      break
    case 'error':
      console.error(format(log))
      break
  }
}

/**
 * Format a log into a string for logging to console
 * @param log
 */
function format(log: LogShape): string {
  return JSON.stringify(log)
}
