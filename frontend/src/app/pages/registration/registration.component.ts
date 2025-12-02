import { Component, inject, type OnInit } from '@angular/core'
import { AuthService } from '../../services/auth.service'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { MaterialModule } from '../../material-module'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { HttpErrorResponse } from '@angular/common/http'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'
import { SnackbarService } from '../../services/snackbar.service'
import { USERNAME_REGEX } from '@shared/constants'
import type { InvitationDetails } from '@shared/api-response/InvitationDetails'
import { ConfigService } from '../../services/config.service'
import { NewPasswordInputComponent } from '../../components/new-password-input/new-password-input.component'
import { SpinnerService } from '../../services/spinner.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { TextDividerComponent } from '../../components/text-divider/text-divider.component'
import { PasskeyService, type PasskeySupport } from '../../services/passkey.service'
import { startRegistration, WebAuthnError } from '@simplewebauthn/browser'
import { UserService } from '../../services/user.service'
@Component({
  selector: 'app-registration',
  templateUrl: './registration.component.html',
  styleUrls: ['./registration.component.scss'],
  imports: [
    ReactiveFormsModule,
    MaterialModule,
    ValidationErrorPipe,
    RouterLink,
    NewPasswordInputComponent,
    TextDividerComponent,
  ],
})
export class RegistrationComponent implements OnInit {
  public form = new FormGroup({
    username: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required, Validators.minLength(3), Validators.pattern(USERNAME_REGEX)]),

    email: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.email]),

    name: new FormControl<string | null>({
      value: null,
      disabled: false,
    }, [Validators.minLength(3)]),

    password: new FormControl<string>({
      value: '',
      disabled: false,
    }, []),
  })

  public invitation?: InvitationDetails

  public pwdShow: boolean = false
  config?: ConfigResponse
  passkeySupport?: PasskeySupport

  private snackbarService = inject(SnackbarService)
  private authService = inject(AuthService)
  private userService = inject(UserService)
  private configService = inject(ConfigService)
  private passkeyService = inject(PasskeyService)
  private route = inject(ActivatedRoute)
  private spinnerService = inject(SpinnerService)

  ngOnInit() {
    this.route.queryParamMap.subscribe(async (queryParams) => {
      const inviteId = queryParams.get('invite')
      const challenge = queryParams.get('challenge')
      try {
        this.spinnerService.show()
        const info = await this.authService.interactionExists()
        if (info.successRedirect) {
          window.location.assign(info.successRedirect.location)
        }
      } catch (_e) {
        // interaction session is missing, could not log in without it
        await this.authService.createInteraction()
      } finally {
        this.spinnerService.hide()
      }

      try {
        this.spinnerService.show()
        this.config = await this.configService.getConfig()
        this.passkeySupport = await this.passkeyService.getPasskeySupport()
        if (!this.passkeySupport.enabled) {
          this.form.controls.password.addValidators(Validators.required)
          this.form.controls.password.updateValueAndValidity()
        }
      } finally {
        this.spinnerService.hide()
      }

      try {
        this.spinnerService.show()
        if (this.config.emailVerification) {
          this.form.controls.email.addValidators(Validators.required)
          this.form.controls.email.updateValueAndValidity()
        }
      } finally {
        this.spinnerService.hide()
      }

      if (inviteId && challenge) {
        try {
          this.spinnerService.show()
          this.invitation = await this.authService.getInviteDetails(inviteId, challenge)
        } catch (e) {
          this.snackbarService.error('Invalid invite link.')
          console.error(e)
          return
        } finally {
          this.spinnerService.hide()
        }

        if (this.invitation.username) {
          this.form.controls.username.reset(this.invitation.username)
          this.form.controls.username.disable()
        }

        if (this.invitation.email) {
          this.form.controls.email.reset(this.invitation.email)
          this.form.controls.email.disable()
        }

        if (this.invitation.name) {
          this.form.controls.name.reset(this.invitation.name)
          this.form.controls.name.disable()
        }
      }
    })
  }

  async register() {
    try {
      this.spinnerService.show()
      const redirect = await this.authService.register({
        ...this.form.getRawValue(),
        inviteId: this.invitation?.id,
        challenge: this.invitation?.challenge,
      })

      // See if we want to ask the user to register a passkey
      try {
        this.spinnerService.show()
        const user = (await this.authService.interactionExists()).user
        if (user && await this.passkeyService.shouldAskPasskey(user)) {
          this.spinnerService.hide()
          await this.passkeyService.dialogRegistration()
        }
      } catch (_e) {
        // do nothing
      }

      if (redirect) {
        location.assign(redirect.location)
      }
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

  async passkey() {
    try {
      this.spinnerService.show()
      const username = this.form.getRawValue().username
      if (!username) {
        throw Error('Username required.')
      }

      const optionsJSON = await this.authService.startPasskeySignup(this.invitation?.id, this.invitation?.challenge)
      optionsJSON.user.name = username
      optionsJSON.user.displayName = username
      const registration = await startRegistration({ optionsJSON })
      const redirect = await this.authService.endPasskeySignup({
        ...this.form.getRawValue(),
        inviteId: this.invitation?.id,
        challenge: this.invitation?.challenge,
        ...registration,
      })
      if (redirect) {
        location.assign(redirect.location)
      }
    } catch (e) {
      console.error(e)

      let shownError: string | null = null
      if (e instanceof WebAuthnError && e.name === 'InvalidStateError') {
        shownError ??= 'Passkey already registered.'
      } else {
        shownError ??= 'Could not register passkey.'
      }

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
