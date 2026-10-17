/* eslint-disable @stylistic/lines-between-class-members */
import { Component, inject, viewChild, type OnDestroy, type OnInit, ChangeDetectionStrategy } from '@angular/core'
import { MaterialModule } from '../../material-module'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'
import { SnackbarService } from '../../services/snackbar.service'
import { UserService } from '../../services/user.service'
import type { CurrentUserPrivateDetails } from '@shared/api-response/UserDetails'
import { ConfigService } from '../../services/config.service'
import { PasswordSetComponent } from '../../components/password-reset/password-set.component'
import { SpinnerService } from '../../services/spinner.service'
import { PasskeyService, type PasskeySupport } from '../../services/passkey.service'
import { WebAuthnAbortService } from '@simplewebauthn/browser'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../dialogs/confirm/confirm.component'
import { TotpRegisterComponent } from '../../dialogs/totp-register/totp-register.component'
import { PasskeyEditDialog } from '../../dialogs/passkey-edit/passkey-edit.component'
import { isValidEmail } from '../../validators/validators'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { AsyncPipe } from '@angular/common'
import type { PasskeyResponse } from '@shared/api-response/PasskeyResponse'
import { MatTableDataSource } from '@angular/material/table'
import type { TableColumn } from '../admin/clients/clients.component'
import { MatSort } from '@angular/material/sort'
import { CommonModule } from '@angular/common'

@Component({
  selector: 'app-home',
  imports: [ReactiveFormsModule, MaterialModule, ValidationErrorPipe, PasswordSetComponent, TranslatePipe, AsyncPipe, CommonModule],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  user?: CurrentUserPrivateDetails

  public passkeySupport?: PasskeySupport
  public isPasskeySession: boolean = false
  config?: ConfigResponse

  public profileForm = new FormGroup({
    name: new FormControl<string>(
      {
        value: '',
        disabled: false,
      },
      [Validators.minLength(1)],
    ),
  })

  public emailForm = new FormGroup({
    email: new FormControl<string>(
      {
        value: '',
        disabled: false,
      },
      [Validators.required, isValidEmail],
    ),
  })

  public passwordForm = new FormGroup(
    {
      oldPassword: new FormControl<string>(
        {
          value: '',
          disabled: false,
        },
        [],
      ),
      newPassword: new FormControl<string>(
        {
          value: '',
          disabled: false,
        },
        [Validators.required],
      ),
      confirmPassword: new FormControl<string>(
        {
          value: '',
          disabled: false,
        },
        [Validators.required],
      ),
    },
    {
      validators: (g) => {
        const passAreEqual = g.get('newPassword')?.value === g.get('confirmPassword')?.value
        if (!passAreEqual) {
          g.get('confirmPassword')?.setErrors({ notEqual: 'Must equal Password' })
          return { notEqual: 'Passwords do not match' }
        }
        g.get('confirmPassword')?.setErrors(null)
        return null
      },
    },
  )

  passkeyColumns: TableColumn<PasskeyResponse>[] = [
    {
      columnDef: 'displayName',
      header: 'settings.sections.security.passkeys.columns.name',
      // User name if exists, otherwise use id convert from base64Url to base64, then convert to hex
      cell: element =>
        element.displayName
        || atob(element.id.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map(function (aChar) {
            return ('00' + aChar.charCodeAt(0).toString(16)).slice(-2)
          })
          .join('')
          .slice(0, 4),
    },
    {
      columnDef: 'lastUsed',
      header: 'settings.sections.security.passkeys.columns.last-used',
      cell: element =>
        element.lastUsed
          ? new Date(element.lastUsed).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
          : '-',
    },
    {
      columnDef: 'createdAt',
      header: 'settings.sections.security.passkeys.columns.created-at',
      cell: element =>
        element.createdAt
          ? new Date(element.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
          : '-',
    },
  ]
  displayedPasskeyColumns = ([] as string[]).concat(this.passkeyColumns.map(c => c.columnDef)).concat(['actions'])
  passkeys: MatTableDataSource<PasskeyResponse> = new MatTableDataSource()
  readonly passkeySort = viewChild.required(MatSort)

  private configService = inject(ConfigService)
  private translateService = inject(TranslateService)
  private userService = inject(UserService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  passkeyService = inject(PasskeyService)
  private dialog = inject(MatDialog)

  async ngOnInit() {
    this.passkeySort().active = 'createdAt'
    this.passkeySort().direction = 'desc'

    await this.loadUser()

    this.passkeySupport = this.passkeyService.getPasskeySupport()
    this.config = await this.configService.getConfig()
  }

  ngOnDestroy(): void {
    WebAuthnAbortService.cancelCeremony()
  }

  async loadUser() {
    try {
      this.spinnerService.show()

      try {
        this.user = await this.userService.getMyPrivateUser({
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
        this.passkeys.sort = this.passkeySort()
        this.passkeySort().sortChange.emit({ active: this.passkeySort().active, direction: this.passkeySort().direction })
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
      this.snackbarService.message(String(this.translateService.instant('settings.messages.profile-updated')))
    } catch (_e) {
      this.snackbarService.error(String(this.translateService.instant('settings.messages.profile-update-failed')))
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
      this.snackbarService.message(String(this.translateService.instant('settings.messages.password-updated')))
      await this.loadUser()
    } catch (_e) {
      this.snackbarService.error(String(this.translateService.instant('settings.messages.password-update-failed')))
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
        this.snackbarService.message(String(this.translateService.instant('components.common.messages.verification-email-sent')))
      } else {
        this.snackbarService.message(String(this.translateService.instant('components.common.messages.email-updated')))
      }
    } catch (e) {
      console.error(e)
      this.snackbarService.error(String(this.translateService.instant('components.common.messages.email-update-failed')))
    } finally {
      await this.loadUser()
      this.spinnerService.hide()
    }
  }

  async registerPasskey() {
    const registered = await this.passkeyService.dialogRegistration({
      skipPasskeyPrompt: !!this.user?.skipPasskeyPrompt,
      context: 'manual',
    })
    await this.loadUser()
    if (registered) {
      this.snackbarService.message(String(this.translateService.instant('settings.messages.passkey-registered')))
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
        await this.passkeyService.updatePasskey(id, result)
        this.snackbarService.message(String(this.translateService.instant('settings.messages.passkey-updated')))
      } catch (_e) {
        this.snackbarService.error(String(this.translateService.instant('settings.messages.passkey-update-failed')))
      } finally {
        await this.loadUser()
        this.spinnerService.hide()
      }
    })
  }

  deletePasskey(id: string) {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: String(this.translateService.instant('settings.dialogs.delete-passkey')),
        header: String(this.translateService.instant('admin.common.actions.delete')),
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        await this.userService.removePasskey(id)
        this.snackbarService.message(String(this.translateService.instant('settings.messages.passkey-deleted')))
      } catch (_e) {
        this.snackbarService.error(String(this.translateService.instant('settings.messages.passkey-delete-failed')))
      } finally {
        await this.loadUser()
        this.spinnerService.hide()
      }
    })
  }

  addAuthenticator() {
    const hadTotp = this.user?.hasTotp
    const dialogRef = this.dialog.open(TotpRegisterComponent, {
      panelClass: 'overflow-auto',
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        await this.loadUser()
        this.snackbarService.message(
          hadTotp
            ? String(this.translateService.instant('settings.messages.authenticator-added'))
            : String(this.translateService.instant('settings.messages.mfa-enabled')),
        )
      }
    })
  }

  removeAllPasskeys() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: String(this.translateService.instant('settings.dialogs.delete-all-passkeys')),
        header: String(this.translateService.instant('admin.common.actions.delete')),
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
        this.snackbarService.message(String(this.translateService.instant('settings.messages.passkeys-deleted')))
      } catch (_e) {
        this.snackbarService.error(String(this.translateService.instant('settings.messages.passkeys-delete-failed')))
      } finally {
        await this.loadUser()
        this.spinnerService.hide()
      }
    })
  }

  removePassword() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: String(this.translateService.instant('settings.dialogs.remove-password')),
        header: String(this.translateService.instant('admin.common.actions.remove')),
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        await this.userService.removePassword()
        this.snackbarService.message(String(this.translateService.instant('settings.messages.password-removed')))
      } catch (_e) {
        this.snackbarService.error(String(this.translateService.instant('settings.messages.password-remove-failed')))
      } finally {
        await this.loadUser()
        this.spinnerService.hide()
      }
    })
  }

  disabledMfa() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: String(this.translateService.instant('settings.dialogs.disable-mfa')),
        header: String(this.translateService.instant('admin.common.actions.remove')),
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        await this.userService.disabledMfa()
        this.snackbarService.message(
          String(this.translateService.instant('settings.messages.mfa-disabled')),
        )
      } catch (_e) {
        this.snackbarService.error(
          String(this.translateService.instant('settings.messages.mfa-disable-failed')),
        )
      } finally {
        await this.loadUser()
        this.spinnerService.hide()
      }
    })
  }

  deleteUser() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: String(this.translateService.instant('settings.dialogs.delete-account')),
        header: String(this.translateService.instant('settings.dialogs.danger')),
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
        this.snackbarService.message(String(this.translateService.instant('settings.messages.account-deleted')))
      } catch (_e) {
        this.snackbarService.error(String(this.translateService.instant('settings.messages.account-delete-failed')))
      } finally {
        await this.loadUser()
        this.spinnerService.hide()
      }
    })
  }
}
