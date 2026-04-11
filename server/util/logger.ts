import { booleanString } from './util'
import { als } from './als'

export type LogShape = {
  // debug logs are only printed when ENABLE_DEBUG is true, and do not include stack traces
  // error logs are reserved for configuration or runtime errors, and always printed
  level: 'debug' | 'info' | 'error'
  timestamp?: number
  message: string
  details?: Record<string, unknown> & {
    request?: {
      ip: string | undefined
      method: string
      path: string
    }
    response?: {
      statusCode: number
      location?: string
    }
    user?: {
      id: string
      username: string
      source: string
      amr: string[] // OIDC Authentication Methods Reference
    }
    api_validation?: {
      error: Record<string, unknown>
    }
    login?: {
      userId: string
      amr: string[]
    }
  }
  error?: {
    name?: string
    message: string
    stack?: string
  }
}

export function logger(log: LogShape) {
  if (!log.timestamp) {
    log = { timestamp: Date.now(), ...log }
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
    // keep the highest level between the two logs
    // the log with the highest levels properties takes precedence
    // details should be deep merged
    const levelPriority = { debug: 1, info: 2, error: 3 }
    const higherLog = levelPriority[log.level] >= levelPriority[store.log.level] ? log : store.log
    const lowerLog = higherLog === log ? store.log : log

    const earlierTimestamp = higherLog.timestamp && lowerLog.timestamp
      ? Math.min(higherLog.timestamp, lowerLog.timestamp)
      : lowerLog.timestamp || higherLog.timestamp

    const error = higherLog.error
      ? { name: higherLog.error.name, message: higherLog.error.message, stack: higherLog.error.stack }
      : undefined

    store.log = {
      ...lowerLog, ...higherLog,
      // earlier timestamp takes precedence
      timestamp: earlierTimestamp,
      details: lowerLog.details || higherLog.details ? { ...lowerLog.details, ...higherLog.details } : undefined,
      // error and stack should be taken from the log with the higher level, and if they do not exist should be unset
      error,
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
      // Only print the stack trace when ENABLE_DEBUG is enabled
      if (!booleanString(process.env.ENABLE_DEBUG)) {
        const { error, ...rest } = log
        console.error(format({ ...rest, error: error ? { name: error.name, message: error.message } : undefined }))
      } else {
        console.error(format(log))
      }
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
