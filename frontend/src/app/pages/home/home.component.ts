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
import { WebAuthnAbortService, WebAuthnError } from '@simplewebauthn/browser'
import { ActivatedRoute, Router } from '@angular/router'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { TextDividerComponent } from '../../components/text-divider/text-divider.component'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../dialogs/confirm/confirm.component'

@Component({
  selector: 'app-home',
  imports: [
    ReactiveFormsModule,
    MaterialModule,
    ValidationErrorPipe,
    PasswordSetComponent,
    TextDividerComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  user?: CurrentUserDetails
  public passkeySupport?: PasskeySupport
  public isPasskeySession: boolean = false
  config?: ConfigResponse

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
    }, []),
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
  private dialog = inject(MatDialog)

  async ngOnInit() {
    await this.loadUser()

    this.passkeySupport = await this.passkeyService.getPasskeySupport()
    this.config = await this.configService.getConfig()
  }

  ngOnDestroy(): void {
    WebAuthnAbortService.cancelCeremony()
  }

  async loadUser() {
    try {
      this.spinnerService.show()

      try {
        this.user = await this.userService.getMyUser(true)
      } catch (_e) {
        // If user cannot be loaded, refresh page
        location.reload()
        return
      }

      this.isPasskeySession = this.userService.passkeySession(this.user)

      this.profileForm.reset({
        name: this.user.name ?? '',
      })
      this.emailForm.reset({
        email: this.user.email,
      })
      this.passwordForm.reset()

      if (this.user.hasPassword) {
        this.passwordForm.controls.oldPassword.addValidators(Validators.required)
        this.passwordForm.controls.oldPassword.updateValueAndValidity()
      }
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
      const { oldPassword, newPassword } = this.passwordForm.getRawValue()
      if (!newPassword) {
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
      if (this.config?.emailVerification) {
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

  async registerPasskey() {
    this.spinnerService.show()
    try {
      await this.passkeyService.register()
      await this.loadUser()
      this.snackbarService.message('Passkey registered successfully.')
    } catch (error) {
      if (error instanceof WebAuthnError && error.name === 'InvalidStateError') {
        this.snackbarService.error('Passkey already registered.')
      } else {
        this.snackbarService.error('Could not register Passkey.')
      }
      console.error(error)
    } finally {
      this.spinnerService.hide()
    }
  }

  removeAllPasskeys() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to delete all of your account Passkeys? Previously enabled services like FaceID, Windows Hello, TouchID, etc. will stop working.`,
        header: 'Delete',
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        await this.userService.removeAllPasskeys()
        this.passkeyService.resetPasskeySeen()
        this.passkeyService.resetPasskeySkipped()
        this.snackbarService.message('Removed all Passkeys.')
      } catch (_e) {
        this.snackbarService.error('Could not remove all Passkeys.')
      } finally {
        await this.loadUser()
        this.spinnerService.hide()
      }
    })
  }

  removePassword() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to remove your account password? You will have to login with a Passkey, FaceID, Windows Hello, etc. unless you set a password again. This will also remove any MFA codes you have registered.`,
        header: 'Remove',
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        await this.userService.removePassword()
        this.snackbarService.message('Removed password.')
      } catch (_e) {
        this.snackbarService.error('Could not remove password.')
      } finally {
        await this.loadUser()
        this.spinnerService.hide()
      }
    })
  }

  deleteUser() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to delete your account?`,
        header: 'DANGER',
        requiredText: this.user?.username,
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        await this.userService.deleteUser()
        this.snackbarService.message('Deleted account.')
      } catch (_e) {
        this.snackbarService.error('Could not delete account.')
      } finally {
        await this.loadUser()
        this.spinnerService.hide()
      }
    })
  }
}
