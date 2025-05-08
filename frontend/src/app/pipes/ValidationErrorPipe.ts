import { Pipe, type PipeTransform } from '@angular/core'
import type { ValidationErrors } from '@angular/forms'
@Pipe({
  name: 'validationError',
})
export class ValidationErrorPipe implements PipeTransform {
  transform(errors: ValidationErrors | null | undefined, defaultMessage: string = 'Invalid value.'): string[] {
    if (!errors) {
      return []
    }
    return Object.keys(errors).map((k) => {
      if (typeof errors[k] === 'string') {
        // If custom error message, use that
        return errors[k]
      }

      switch (k.toLowerCase()) {
        case 'required':
          return 'Required.'
        case 'minlength':
          return `Must be at least ${String(errors[k]?.requiredLength)} characters long.`
        case 'maxlength':
          return `Must be less than ${String(errors[k]?.requiredLength)} characters long.`
        case 'email':
          return 'Not a valid email.'
        default:
          return defaultMessage
      }
    })
  }
}
