import { Component, inject } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { MaterialModule } from '../../material-module'
import { AuthService } from '../../services/auth.service'
import { SnackbarService } from '../../services/snackbar.service'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { PasswordSetComponent } from '../../components/password-reset/password-set.component'
import { REDIRECT_PATHS } from '@shared/constants'
import { HttpErrorResponse } from '@angular/common/http'
import { SpinnerService } from '../../services/spinner.service'
import { ConfigService } from '../../services/config.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { TextDividerComponent } from '../../components/text-divider/text-divider.component'
import { PasskeyService, type PasskeySupport } from '../../services/passkey.service'
import { startRegistration, WebAuthnError } from '@simplewebauthn/browser'

@Component({
  selector: 'app-reset-password',
  imports: [
    MaterialModule,
    ReactiveFormsModule,
    PasswordSetComponent,
    TextDividerComponent,
  ],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent {
  userid?: string
  challenge?: string
  config?: ConfigResponse
  passkeySupport?: PasskeySupport

  public passwordForm = new FormGroup({
    newPassword: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required]),
    confirmPassword: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required]),
  }, {
    validators: (g) => {
      const passAreEqual = g.get('newPassword')?.value === g.get('confirmPassword')?.value
      if (!passAreEqual) {
        g.get('confirmPassword')?.setErrors({ notEqual: 'Must equal Password' })
        return { notEqual: 'Passwords do not match' }
      }
      g.get('confirmPassword')?.setErrors(null)
      return null
    },
  })

  private activatedRoute = inject(ActivatedRoute)
  private authService = inject(AuthService)
  private snackbarService = inject(SnackbarService)
  private router = inject(Router)
  private spinnerService = inject(SpinnerService)
  private configService = inject(ConfigService)
  passkeyService = inject(PasskeyService)

  async ngOnInit() {
    const params = this.activatedRoute.snapshot.queryParamMap

    const id = params.get('id')
    const challenge = params.get('challenge')

    if (!id || !challenge) {
      this.snackbarService.error('Invalid Password Reset Link.')
      return
    }

    this.userid = id
    this.challenge = challenge

    try {
      this.spinnerService.show()
      this.config = await this.configService.getConfig()
      this.passkeySupport = await this.passkeyService.getPasskeySupport()
    } finally {
      this.spinnerService.hide()
    }
  }

  async send() {
    try {
      if (!this.userid || !this.challenge || !this.passwordForm.controls.newPassword.value) {
        throw new Error('Missing required parameters for submit.')
      }

      this.spinnerService.show()

      await this.authService.resetPassword({
        userId: this.userid,
        challenge: this.challenge,
        newPassword: this.passwordForm.controls.newPassword.value,
      })
      this.snackbarService.message('Password Reset Complete.')
      await this.router.navigate([REDIRECT_PATHS.LOGIN])
    } catch (e) {
      console.error(e)

      let shownError: string | null = null
      if (e instanceof HttpErrorResponse) {
        shownError ??= e.error?.message
      } else {
        shownError ??= (e as Error).message
      }

      shownError ??= 'Something went wrong.'
      this.snackbarService.error(shownError)
    } finally {
      this.spinnerService.hide()
    }
  }

  async registerPasskey() {
    this.spinnerService.show()
    try {
      const userId = this.userid
      const challenge = this.challenge
      if (!userId || !challenge) {
        throw new Error('Missing required parameters for submit.')
      }
      const optionsJSON = await this.authService.resetPasswordPasskeyStart({ userId, challenge })
      const registration = await startRegistration({ optionsJSON })
      await this.authService.resetPasswordPasskeyEnd({ ...registration, userId, challenge })
      this.snackbarService.message('Passkey created.')
      await this.router.navigate([REDIRECT_PATHS.LOGIN])
    } catch (error) {
      if (error instanceof WebAuthnError && error.name === 'InvalidStateError') {
        this.snackbarService.error('Passkey already registered.')
      } else {
        this.snackbarService.error('Could not register passkey.')
      }
      console.error(error)
    } finally {
      this.spinnerService.hide()
    }
  }
}
