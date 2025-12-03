import appConfig from './config'

function debug(input: unknown) {
  if (appConfig.DEBUG) {
    console.log(input)
  }
}

function error(input: unknown) {
  if (appConfig.DEBUG) {
    console.error(input)
  } else if (input instanceof Error) {
    console.error(input.message)
  }
}

export const logger = {
  debug,
  error,
}
