import { Component, inject, signal, type OnInit } from '@angular/core'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { MaterialModule } from '../../material-module'
import { TotpInputComponent } from '../../components/totp-input/totp-input.component'
import { AuthService } from '../../services/auth.service'
import { SpinnerService } from '../../services/spinner.service'
import { SnackbarService } from '../../services/snackbar.service'
import { HttpErrorResponse } from '@angular/common/http'

@Component({
  selector: 'app-totp-register',
  imports: [MaterialModule, TotpInputComponent],
  templateUrl: './totp-register.component.html',
  styleUrl: './totp-register.component.scss',
})
export class TotpRegisterComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<TotpRegisterComponent>)
  readonly data = inject<{ enableMfa?: boolean } | undefined>(MAT_DIALOG_DATA)

  secret = signal<string | undefined>(undefined)
  uri = signal<string | undefined>(undefined)
  disabled = signal<boolean>(true)

  private spinnerService = inject(SpinnerService)
  private snackbarService = inject(SnackbarService)
  private authService = inject(AuthService)

  async ngOnInit(): Promise<void> {
    this.spinnerService.show()
    this.disabled.set(true)
    try {
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
      await this.authService.verifyTotp(token, !!this.data?.enableMfa)
      this.dialogRef.close(true)
    } catch (e) {
      console.error(e)
      if (e instanceof HttpErrorResponse && e.status === 401) {
        this.snackbarService.error('Invalid code entered.')
      } else {
        this.snackbarService.error(this.data?.enableMfa ? 'Could not enable Multi-Factor Authentication.' : 'Could not add authenticator.')
      }
    } finally {
      this.spinnerService.hide()
      this.disabled.set(false)
    }
  }
}
