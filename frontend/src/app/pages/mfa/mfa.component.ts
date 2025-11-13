import { Component, inject, signal, type OnInit } from '@angular/core'
import { TotpInputComponent } from '../../components/totp-input/totp-input.component'
import { TextDividerComponent } from '../../components/text-divider/text-divider.component'
import { MatButtonModule } from '@angular/material/button'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { ConfigService } from '../../services/config.service'
import { PasskeyService, type PasskeySupport } from '../../services/passkey.service'
import { MaterialModule } from '../../material-module'
import { SnackbarService } from '../../services/snackbar.service'
import { SpinnerService } from '../../services/spinner.service'
import { AuthService } from '../../services/auth.service'
import { HttpErrorResponse } from '@angular/common/http'

@Component({
  selector: 'app-mfa',
  imports: [TotpInputComponent, TextDividerComponent, MatButtonModule, MaterialModule],
  templateUrl: './mfa.component.html',
  styleUrl: './mfa.component.scss',
})
export class MfaComponent implements OnInit {
  config?: ConfigResponse
  passkeySupport?: PasskeySupport
  disabled = signal<boolean>(false)

  private configService = inject(ConfigService)
  private passkeyService = inject(PasskeyService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private authService = inject(AuthService)

  async ngOnInit() {
    this.passkeySupport = await this.passkeyService.getPasskeySupport()
    this.config = await this.configService.getConfig()
  }

  async totpVerify(token: string) {
    this.spinnerService.show()
    this.disabled.set(true)
    try {
      const redirect = await this.authService.verifyTotp(token)
      if (redirect) {
        location.assign(redirect.location)
      }
    } catch (e) {
      console.error(e)
      if (e instanceof HttpErrorResponse && e.status === 401) {
        this.snackbarService.error('Invalid code entered.')
      } else {
        this.snackbarService.error('Something went wrong.')
      }
    } finally {
      this.spinnerService.hide()
      this.disabled.set(false)
    }
  }

  async passkeyLogin(auto: boolean) {
    try {
      const redirect = await this.passkeyService.login()
      if (redirect) {
        location.assign(redirect.location)
      }
    } catch (error) {
      if (!auto) {
        this.snackbarService.error('Could not authenticate with passkey.')
      }
      console.error(error)
    }
  }

  async cancelMfa() {
    this.spinnerService.show()
    this.disabled.set(true)
    try {
      await this.authService.cancelInteraction()
      window.history.back()
    } catch (e) {
      console.error(e)
      this.snackbarService.error('Something went wrong. Try logout from dropdown menu in header.')
    } finally {
      this.spinnerService.hide()
      this.disabled.set(false)
    }
  }
}
