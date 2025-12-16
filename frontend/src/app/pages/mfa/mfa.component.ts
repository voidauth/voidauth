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
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'
import { UserService } from '../../services/user.service'
import { WebAuthnError } from '@simplewebauthn/browser'
import { isUnapproved, isUnverified, loginFactors } from '@shared/user'
import { Router } from '@angular/router'

@Component({
  selector: 'app-mfa',
  imports: [TotpInputComponent, TextDividerComponent, MatButtonModule, MaterialModule],
  templateUrl: './mfa.component.html',
  styleUrl: './mfa.component.scss',
})
export class MfaComponent implements OnInit {
  config?: ConfigResponse
  user?: CurrentUserDetails
  passkeySupport?: PasskeySupport
  disabled = signal<boolean>(false)
  secret = signal<string | undefined>(undefined)
  uri = signal<string | undefined>(undefined)

  private configService = inject(ConfigService)
  private passkeyService = inject(PasskeyService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private authService = inject(AuthService)
  private userService = inject(UserService)
  private router = inject(Router)

  async ngOnInit() {
    this.spinnerService.show()
    this.disabled.set(true)
    try {
      try {
        this.user = await this.userService.getMyUser()
      } catch (_e) {
        // If user cannot be loaded, do nothing
      }

      this.passkeySupport = await this.passkeyService.getPasskeySupport()
      this.config = await this.configService.getConfig()

      // User does not have a totp, but should be able to register one
      if (this.user && !this.user.hasTotp && !!loginFactors(this.user.amr)
        && !isUnapproved(this.user, this.config.signupRequiresApproval) && !isUnverified(this.user, this.config.emailVerification)) {
        try {
          const { secret, uri } = await this.authService.registerTotp()
          this.secret.set(secret)
          this.uri.set(uri)
        } catch (e) {
          console.error(e)
          this.snackbarService.error('Could not get authenticator options.')
        }
      }
    } finally {
      this.spinnerService.hide()
      this.disabled.set(false)
    }
  }

  async totpVerify(token: string) {
    this.spinnerService.show()
    this.disabled.set(true)
    try {
      const redirect = await this.authService.verifyTotp(token, false)

      // See if we want to ask the user to register a passkey
      try {
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

  async passkeyLogin() {
    this.spinnerService.show()
    try {
      const redirect = await this.passkeyService.login()
      if (redirect) {
        location.assign(redirect.location)
      }
    } catch (error) {
      this.snackbarService.error('Could not authenticate with passkey.')
      console.error(error)
    } finally {
      this.spinnerService.hide()
    }
  }

  async passkeyRegister() {
    this.spinnerService.show()
    try {
      const redirect = await this.passkeyService.register()
      if (redirect) {
        location.assign(redirect.location)
      }
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

  async cancelMfa() {
    this.spinnerService.show()
    this.disabled.set(true)
    try {
      try {
        await this.authService.interactionExists()
        await this.authService.cancelInteraction()
      } catch (_e) {
        // If interaction does not still exist do nothing
      }

      if (history.length) {
        window.history.back()
      } else {
        await this.router.navigate(['/'], {
          replaceUrl: true,
        })
      }
    } catch (e) {
      console.error(e)
      this.snackbarService.error('Something went wrong. Try logout from dropdown menu in header.')
    } finally {
      this.spinnerService.hide()
      this.disabled.set(false)
    }
  }
}
