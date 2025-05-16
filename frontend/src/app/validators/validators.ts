import type { AbstractControl } from '@angular/forms'

export function emptyOrMinLength(length: number) {
  return (control: AbstractControl) => {
    const valid = !control.value || (typeof control.value === 'string' && control.value.length >= length)
    return valid
      ? null
      : {
          emptyOrLength: `Must be either blank or at least ${String(length)} characters long.`,
        }
  }
}

export function isValidURL(control: AbstractControl) {
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
      isValidUrl: 'Must be a valid URL.',
    }
  }
}
