import { Component, inject, signal, type OnInit, ChangeDetectionStrategy } from '@angular/core'
import { MatDialogRef } from '@angular/material/dialog'
import { MaterialModule } from '../../material-module'
import { TotpInputComponent } from '../../components/totp-input/totp-input.component'
import { AuthService } from '../../services/auth.service'
import { SpinnerService } from '../../services/spinner.service'
import { SnackbarService } from '../../services/snackbar.service'
import { HttpErrorResponse } from '@angular/common/http'
import { TranslatePipe } from '@ngx-translate/core'
import { UserService } from '../../services/user.service'
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'

@Component({
  selector: 'app-totp-register',
  imports: [MaterialModule, TotpInputComponent, TranslatePipe],
  templateUrl: './totp-register.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './totp-register.component.scss',
})
export class TotpRegisterComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<TotpRegisterComponent>)

  secret = signal<string | undefined>(undefined)
  uri = signal<string | undefined>(undefined)
  disabled = signal<boolean>(true)
  lockedUntil = signal<Date | null>(null)
  user?: CurrentUserDetails

  private spinnerService = inject(SpinnerService)
  private snackbarService = inject(SnackbarService)
  private authService = inject(AuthService)
  private userService = inject(UserService)

  async ngOnInit(): Promise<void> {
    this.spinnerService.show()
    this.disabled.set(true)
    try {
      try {
        this.user = await this.userService.getMyUser()
      } catch (_e) {
        // If user cannot be loaded, do nothing
      }
      const totpOptions = await this.authService.registerTotp()
      this.secret.set(totpOptions.secret)
      this.uri.set(totpOptions.uri)
    } catch (e) {
      console.error(e)
      this.snackbarService.error('Could not get authenticator info.')
      this.dialogRef.close(false)
    } finally {
      this.spinnerService.hide()
      this.disabled.set(false)
    }
  }

  async verifyToken(token: string) {
    this.spinnerService.show()
    this.disabled.set(true)
    try {
      await this.authService.verifyTotp(token)
      this.dialogRef.close(true)
    } catch (e) {
      console.error(e)
      if (e instanceof HttpErrorResponse && e.status === 423) {
        const errorBody: unknown = e.error
        if (typeof errorBody === 'object' && errorBody !== null && 'lockedUntil' in errorBody
          && typeof errorBody.lockedUntil === 'string') {
          const lockedUntil = new Date(errorBody.lockedUntil)
          if (!Number.isNaN(lockedUntil.getTime())) {
            this.lockedUntil.set(lockedUntil)
          }
        }
      } else if (e instanceof HttpErrorResponse && e.status === 401) {
        this.snackbarService.error('Invalid code entered.')
      } else {
        this.snackbarService.error(!this.user?.mfaRequired
          ? 'Could not enable Multi-Factor Authentication.'
          : 'Could not add authenticator.')
      }
    } finally {
      this.spinnerService.hide()
      this.disabled.set(false)
    }
  }
}
