import { inject, Pipe, type PipeTransform } from '@angular/core'
import type { ValidationErrors } from '@angular/forms'
import { TranslateService } from '@ngx-translate/core'
import { of, type Observable } from 'rxjs'
@Pipe({
  name: 'validationError',
})
export class ValidationErrorPipe implements PipeTransform {
  private translate = inject(TranslateService)
  transform(errors: ValidationErrors | null | undefined, defaultErrorMessage?: string): Observable<unknown> {
    if (!errors) {
      return of('')
    }
    return Object.keys(errors).map((k) => {
      switch (k.toLowerCase()) {
        case 'required':
          return this.translate.stream('form-errors.required')
        case 'min':
          return this.translate.stream('form-errors.min', { min: String(errors[k]?.min) })
        case 'max':
          return this.translate.stream('form-errors.max', { max: String(errors[k]?.max) })
        case 'minlength':
          return this.translate.stream('form-errors.minLength', { requiredLength: String(errors[k]?.requiredLength) })
        case 'maxlength':
          return this.translate.stream('form-errors.maxLength', { requiredLength: String(errors[k]?.requiredLength) })
        case 'email':
          return this.translate.stream('form-errors.email')
        default:
          if (typeof errors[k] === 'string') {
            // If custom error message, use that
            return of(errors[k])
          } else if (defaultErrorMessage) {
            return of(defaultErrorMessage)
          }
          return this.translate.stream('form-errors.default')
      }
    })[0] ?? of('')
  }
}
