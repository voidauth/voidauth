import { Component, inject, type OnInit } from '@angular/core'
import { ConfigService } from '../../services/config.service'
import { FormGroup, FormControl, Validators, ReactiveFormsModule } from '@angular/forms'
import { MaterialModule } from '../../material-module'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'
import { AuthService } from '../../services/auth.service'
import { SnackbarService } from '../../services/snackbar.service'
import { HttpErrorResponse } from '@angular/common/http'
import { SpinnerService } from '../../services/spinner.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'

@Component({
  selector: 'app-forgot-password',
  imports: [
    ReactiveFormsModule,
    MaterialModule,
    ValidationErrorPipe,
  ],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent implements OnInit {
  config?: ConfigResponse
  emailSent: boolean = false

  public form = new FormGroup({
    input: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required]),
  })

  configService = inject(ConfigService)
  authService = inject(AuthService)
  snackbarService = inject(SnackbarService)
  spinnerService = inject(SpinnerService)

  async ngOnInit() {
    this.config = await this.configService.getConfig()
  }

  async send() {
    try {
      this.spinnerService.show()
      const input = this.form.controls.input.value
      if (!input) {
        throw new Error('Invalid email or username.')
      }

      const result = await this.authService.sendPasswordReset(input)
      this.emailSent = result.emailSent

      this.snackbarService.message(this.emailSent ? 'Password reset link sent.' : 'Password reset link created, but could not be sent.')
    } catch (e) {
      let shownError: string | null = null

      if (e instanceof HttpErrorResponse) {
        const status = e.status

        if (status === 404) {
          shownError = 'User not found.'
        }

        shownError ??= e.error?.message
      } else {
        shownError ??= (e as Error).message
      }

      console.error(e)
      shownError ??= 'Something went wrong.'
      this.snackbarService.error(shownError)
    } finally {
      this.spinnerService.hide()
    }
  }
}
