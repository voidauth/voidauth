import { booleanString } from './util'

function debug(input: unknown) {
  if (booleanString(process.env.DEBUG)) {
    console.log(input)
  }
}

function error(input: unknown) {
  if (!booleanString(process.env.DEBUG) && input instanceof Error) {
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
