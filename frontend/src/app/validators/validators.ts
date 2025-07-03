import type { AbstractControl } from '@angular/forms'

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
