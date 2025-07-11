import { Component, inject, type OnDestroy, type OnInit } from '@angular/core'
import { MaterialModule } from '../../material-module'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'
import { SnackbarService } from '../../services/snackbar.service'
import { UserService } from '../../services/user.service'
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'
import { ConfigService } from '../../services/config.service'
import { PasswordSetComponent } from '../../components/password-reset/password-set.component'
import { SpinnerService } from '../../services/spinner.service'
import { PasskeyService, type PasskeySupport } from '../../services/passkey.service'
import { startRegistration, WebAuthnAbortService, WebAuthnError } from '@simplewebauthn/browser'
import { ActivatedRoute, Router } from '@angular/router'

@Component({
  selector: 'app-home',
  imports: [
    ReactiveFormsModule,
    MaterialModule,
    ValidationErrorPipe,
    PasswordSetComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  user?: CurrentUserDetails
  public passkeySupport?: PasskeySupport
  public isPasskeySession: boolean = false

  public profileForm = new FormGroup({
    name: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.minLength(4)]),
  })

  public emailForm = new FormGroup({
    email: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required, Validators.email]),
  })

  public passwordForm = new FormGroup({
    oldPassword: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required]),
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

  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private configService = inject(ConfigService)
  private userService = inject(UserService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  passkeyService = inject(PasskeyService)

  async ngOnInit() {
    await this.loadUser()

    this.passkeySupport = await this.passkeyService.getPasskeySupport()

    this.route.queryParamMap.subscribe(async (queryParams) => {
      if (queryParams.get('action') === 'passkey') {
        if (!this.isPasskeySession
          && this.passkeySupport?.enabled
          && !this.passkeyService.localPasskeySeen()) {
          // should try to automatically register a passkey
          await this.registerPasskey(true)
        }
        void this.router.navigate([], {
          queryParams: {
            action: null,
          },
          queryParamsHandling: 'merge',
        })
      }
    })
  }

  ngOnDestroy(): void {
    WebAuthnAbortService.cancelCeremony()
  }

  async loadUser() {
    try {
      this.spinnerService.show()
      this.user = await this.userService.getMyUser()

      this.isPasskeySession = this.userService.passkeySession(this.user)

      this.profileForm.reset({
        name: this.user.name ?? '',
      })
      this.emailForm.reset({
        email: this.user.email,
      })
      this.passwordForm.reset()
    } finally {
      this.spinnerService.hide()
    }
  }

  async updateProfile() {
    try {
      this.spinnerService.show()

      await this.userService.updateProfile({
        name: this.profileForm.value.name ?? undefined,
      })
      this.snackbarService.message('Profile updated.')
    } catch (_e) {
      this.snackbarService.error('Could not update profile.')
    } finally {
      await this.loadUser()
      this.spinnerService.hide()
    }
  }

  async updatePassword() {
    try {
      this.spinnerService.show()
      const { oldPassword, newPassword } = this.passwordForm.value
      if (!oldPassword || !newPassword) {
        throw new Error('Password missing.')
      }

      await this.userService.updatePassword({
        oldPassword: oldPassword,
        newPassword: newPassword,
      })
      this.snackbarService.message('Password updated.')
      await this.loadUser()
    } catch (_e) {
      this.snackbarService.error('Could not update password.')
    } finally {
      this.spinnerService.hide()
    }
  }

  async updateEmail() {
    try {
      this.spinnerService.show()
      const email = this.emailForm.value.email
      if (!email) {
        throw new Error('Email missing.')
      }
      await this.userService.updateEmail({
        email: email,
      })
      // if email verification enabled, indicate that in message
      if ((await this.configService.getConfig()).emailVerification) {
        this.snackbarService.message('Verification email sent.')
      } else {
        this.snackbarService.message('Email updated.')
      }
    } catch (_e) {
      this.snackbarService.error('Could not update email.')
    } finally {
      await this.loadUser()
      this.spinnerService.hide()
    }
  }

  async registerPasskey(auto: boolean) {
    this.spinnerService.show()
    try {
      const optionsJSON = await this.passkeyService.getRegistrationOptions()
      const registration = await startRegistration({ optionsJSON, useAutoRegister: auto })
      await this.passkeyService.sendRegistration(registration)
      await this.loadUser()
    } catch (error) {
      if (!auto) {
        if (error instanceof WebAuthnError && error.name === 'InvalidStateError') {
          this.snackbarService.error('Passkey already registered.')
        } else {
          this.snackbarService.error('Could not register passkey.')
        }
      }
      console.error(error)
    } finally {
      this.spinnerService.hide()
    }
  }
}
