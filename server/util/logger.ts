import { booleanString } from './util'

function debug(input: unknown) {
  if (booleanString(process.env.ENABLE_DEBUG)) {
    console.log(input)
  }
}

function error(input: unknown) {
  // do not log error stack traces unless ENABLE_DEBUG
  if (input instanceof Error && !booleanString(process.env.ENABLE_DEBUG)) {
    console.error(input.message)
  } else {
    console.error(input)
  }
}

function info(input: unknown) {
  console.log(input)
}

export const logger = {
  debug,
  info,
  error,
}
