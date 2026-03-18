/* eslint-disable @stylistic/lines-between-class-members */
import { Component, inject, viewChild, type OnDestroy, type OnInit } from '@angular/core'
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
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../dialogs/confirm/confirm.component'
import { TotpRegisterComponent } from '../../dialogs/totp-register/totp-register.component'
import { PasskeyEditDialog } from '../../dialogs/passkey-edit/passkey-edit.component'
import { isValidEmail } from '../../validators/validators'
import type { PasskeyResponse } from '@shared/api-response/PasskeyResponse'
import { MatTableDataSource } from '@angular/material/table'
import type { TableColumn } from '../admin/clients/clients.component'
import { MatSort } from '@angular/material/sort'
import { CommonModule } from '@angular/common'

@Component({
  selector: 'app-home',
  imports: [
    ReactiveFormsModule,
    MaterialModule,
    ValidationErrorPipe,
    PasswordSetComponent,
    CommonModule,
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
    }, [Validators.minLength(1)]),
  })

  public emailForm = new FormGroup({
    email: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required, isValidEmail]),
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

  passkeyColumns: TableColumn<PasskeyResponse>[] = [
    {
      columnDef: 'displayName',
      header: 'Name',
      // User name if exists, otherwise use id convert from base64Url to base64, then convert to hex
      cell: element => element.displayName || atob(element.id.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map(function (aChar) {
          return ('00' + aChar.charCodeAt(0).toString(16)).slice(-2)
        }).join('').slice(0, 4),
    },
    {
      columnDef: 'lastUsed',
      header: 'Last Used',
      cell: element => element.lastUsed
        ? new Date(element.lastUsed).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : '-',
    },
    {
      columnDef: 'createdAt',
      header: 'Created At',
      cell: element => element.createdAt
        ? new Date(element.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : '-',
    },
  ]
  displayedPasskeyColumns = ([] as string[]).concat(this.passkeyColumns.map(c => c.columnDef)).concat(['actions'])
  passkeys: MatTableDataSource<PasskeyResponse> = new MatTableDataSource()
  readonly passkeySort = viewChild.required(MatSort)

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
        this.user = await this.userService.getMyUser({
          disableCache: true,
        })
      } catch (_e) {
        // If user cannot be loaded, refresh page
        location.reload()
        return
      }

      try {
        this.passkeys.data = await this.userService.getPasskeys()
        // Set the default sort to createdAt desc
        this.passkeySort().active = 'createdAt'
        this.passkeySort().direction = 'desc'
        this.passkeySort().sortChange.emit({ active: 'createdAt', direction: 'desc' })
        this.passkeys.sort = this.passkeySort()
      } catch (_e) {
        // Do nothing
      }

      this.isPasskeySession = this.userService.isPasskeySession(this.user)

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
    } catch (e) {
      console.error(e)
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

  updatePasskey(id: string, displayName: string | null) {
    const dialogRef = this.dialog.open(PasskeyEditDialog, {
      data: { id, displayName },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result || typeof result !== 'string') {
        return
      }

      try {
        this.spinnerService.show()
        await this.userService.updatePasskey(
          id,
          result,
        )
        this.snackbarService.message('Passkey updated.')
      } catch (_e) {
        this.snackbarService.error('Could not update Passkey.')
      } finally {
        await this.loadUser()
        this.spinnerService.hide()
      }
    })
  }

  deletePasskey(id: string) {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to delete this Passkey?`,
        header: 'Delete',
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        await this.userService.removePasskey(id)
        this.snackbarService.message('Passkey deleted.')
      } catch (_e) {
        this.snackbarService.error('Passkey could not be deleted.')
      } finally {
        await this.loadUser()
        this.spinnerService.hide()
      }
    })
  }

  addAuthenticator() {
    const hadTotp = this.user?.hasTotp
    const dialogRef = this.dialog.open<TotpRegisterComponent, { enableMfa: boolean } | undefined>(TotpRegisterComponent, {
      data: { enableMfa: true },
      panelClass: 'overflow-auto',
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        await this.loadUser()
        this.snackbarService.message(hadTotp ? 'Authenticator added successfully.' : 'Multi-Factor Authentication enabled.')
      }
    })
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
        message: `Are you sure you want to remove your account password? You will have to login with a Passkey, FaceID, Windows Hello, etc. until you set a password again.`,
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

  removeAllAuthenticators() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to disable Multi-Factor Authentication and remove any Authenticators on your account?`,
        header: 'Remove',
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        await this.userService.removeAllAuthenticators()
        this.snackbarService.message('Multi-Factor Authentication disabled and Authenticators removed.')
      } catch (_e) {
        this.snackbarService.error('Could not disable Multi-Factor Authentication or remove Authenticators.')
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
