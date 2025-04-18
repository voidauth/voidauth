import type { AbstractControl } from "@angular/forms"

export function emptyOrMinLength(length: number) {
  return (control: AbstractControl) => {
    const valid = !control.value || control.value.length >= length
    return valid ? null : {
      emptyOrLength: `Must be either blank or at least ${length} characters long.`
    }
  }
}

export function isValidURL(control: AbstractControl) {
  try {
    if (control.value) {
      const u = new URL(control.value)
      const { protocol } = u
      if (!["https:", "http:"].includes(protocol)) {
        throw new Error("Invalid URL protocol.")
      }
    }
    return null
  } catch (e) {
    return {
      isValidUrl: 'Must be a valid URL.'
    }
  }
}