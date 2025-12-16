import __debug from 'debug'

const _debug = __debug('voidauth:debug')
const _error = __debug('voidauth:error')

function debug(input: unknown) {
  _debug(input)
}

function error(input: unknown) {
  if (input instanceof Error) {
    _error(input.message)
    _debug(input.stack)
  } else {
    _error(input)
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
