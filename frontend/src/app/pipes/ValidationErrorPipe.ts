import { Pipe, type PipeTransform } from '@angular/core'
import type { ValidationErrors } from '@angular/forms'
@Pipe({
  name: 'validationError',
})
export class ValidationErrorPipe implements PipeTransform {
  transform(errors: ValidationErrors | null | undefined, defaultMessage: string = 'Invalid value.'): string {
    if (!errors) {
      return ''
    }
    return Object.keys(errors).map((k) => {
      switch (k.toLowerCase()) {
        case 'required':
          return 'Required.'
        case 'min':
          return `Must be at least ${String(errors[k]?.min)}.`
        case 'max':
          return `Cannot be greater than ${String(errors[k]?.max)}.`
        case 'minlength':
          return `Must be at least ${String(errors[k]?.requiredLength)} characters long.`
        case 'maxlength':
          return `Must be less than ${String(errors[k]?.requiredLength)} characters long.`
        case 'email':
          return 'Not a valid email.'
        default:
          if (typeof errors[k] === 'string') {
            // If custom error message, use that
            return errors[k]
          }
          return defaultMessage
      }
    })[0] ?? ''
  }
}
