import type { AbstractControl } from '@angular/forms'
import { isValidWildcardURL } from '@shared/utils'

export function isValidWebURLControl(control: AbstractControl) {
  try {
    if (typeof control.value === 'string' && control.value) {
      const value = control.value
      if (!/^https?:\/\//.exec(control.value)) {
        return {
          isValidUrl: 'Must start with http(s)://',
        }
      }
      const { protocol } = new URL(value)
      if (!['https:', 'http:'].includes(protocol)) {
        return {
          isValidUrl: 'Invalid URL protocol, must be http(s)',
        }
      }
    }
    return null
  } catch (_e) {
    return {
      isValidUrl: 'Must be a valid web URL.',
    }
  }
}

export function isValidURLControl(control: AbstractControl) {
  try {
    if (typeof control.value === 'string' && control.value) {
      const value = control.value
      new URL(value)
    }
    return null
  } catch (_e) {
    return {
      isValidUrl: 'Must be a valid URL.',
    }
  }
}

export function isValidWildcardURLControl(control: AbstractControl) {
  if (typeof control.value === 'string' && control.value && !isValidWildcardURL(control.value)) {
    return {
      isValidUrl: 'Must be a valid wildcard URL.',
    }
  }
  return null
}

export function isValidURL(value: string) {
  try {
    new URL(value)
    return true
  } catch (_e) {
    return false
  }
}
