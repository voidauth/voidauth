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

@Component({
  selector: 'app-reset-password',
  imports: [
    MaterialModule,
    ReactiveFormsModule,
    PasswordSetComponent,
  ],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent {
  userid?: string
  challenge?: string

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

  ngOnInit() {
    const params = this.activatedRoute.snapshot.queryParamMap

    const id = params.get('id')
    const challenge = params.get('challenge')

    if (!id || !challenge) {
      this.snackbarService.error('Invalid Password Reset Link.')
      return
    }

    this.userid = id
    this.challenge = challenge
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
      this.snackbarService.show('Password Reset Complete.')
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
}
