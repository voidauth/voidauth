import appConfig from './config'

function debug(input: unknown) {
  if (appConfig.DEBUG) {
    console.log(input)
  }
}

function error(input: unknown) {
  if (!appConfig.DEBUG && input instanceof Error) {
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
