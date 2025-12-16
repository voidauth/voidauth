import { HttpClient } from '@angular/common/http'
import { Component, inject, Injectable, type OnInit } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import {
  browserSupportsWebAuthn, platformAuthenticatorIsAvailable,
  startAuthentication, startRegistration, WebAuthnError, type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import type { Redirect } from '@shared/api-response/Redirect'
import { UAParser } from 'ua-parser-js'
import { MatDialog } from '@angular/material/dialog'
import { SnackbarService } from './snackbar.service'
import { SpinnerService } from './spinner.service'
import { MaterialModule } from '../material-module'
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'

@Injectable({
  providedIn: 'root',
})
export class PasskeyService {
  private http = inject(HttpClient)
  private dialog = inject(MatDialog)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)

  /**
   * Checks if passkey registration or usage has ever been flagged in localStorage.
   * Not a perfect solution, but until there is a method to check if a device passkey exists,
   * this will have to do. This is just a hint and should not disable any functionality.
   * @returns if there is passkey usage flagged in localStorage
   */
  localPasskeySeen() {
    return !!localStorage.getItem('passkey_seen')
  }

  /**
   * Checks if the passkey registration dialog has been skipped before
   * @returns if the passkey dialog has previously been skipped
   */
  localPasskeySkipped() {
    return !!localStorage.getItem('passkey_skipped')
  }

  resetPasskeySeen() {
    localStorage.removeItem('passkey_seen')
  }

  resetPasskeySkipped() {
    localStorage.removeItem('passkey_skipped')
  }

  async getPasskeySupport(): Promise<PasskeySupport> {
    if (!browserSupportsWebAuthn()) {
      return {
        enabled: false,
      }
    }

    let name: string | undefined
    let icon: string | undefined
    if (await platformAuthenticatorIsAvailable()) {
      const { os } = UAParser(navigator.userAgent)
      // if (os.name == 'Windows') {
      //   name = 'Windows Hello'
      //   icon = 'sentiment_satisfied'
      // } else
      if (os.name == 'iOS') {
        name = 'Face ID'
        icon = 'face'
      } else if (os.name == 'macOS') {
        name = 'Touch ID'
        icon = 'fingerprint'
      }
    }

    return {
      enabled: true,
      platformName: name,
      platformIcon: icon,
    }
  }

  private async getAuthOptions() {
    return firstValueFrom(this.http.post<PublicKeyCredentialRequestOptionsJSON>('/api/interaction/passkey/start', null))
  }

  private async sendAuth(auth: AuthenticationResponseJSON) {
    const result = firstValueFrom(this.http.post<Redirect | undefined>('/api/interaction/passkey/end', auth))
    localStorage.setItem('passkey_seen', Date())
    return result
  }

  async login(auto: boolean = false) {
    const optionsJSON = await this.getAuthOptions()
    const auth = await startAuthentication({ optionsJSON, useBrowserAutofill: auto })
    return await this.sendAuth(auth)
  }

  async register() {
    const options = await firstValueFrom(this.http.post<PublicKeyCredentialCreationOptionsJSON>(
      '/api/interaction/passkey/registration/start',
      null,
    ))
    const reg = await startRegistration({ optionsJSON: options })
    try {
      const result = await firstValueFrom(this.http.post<Redirect | null>('/api/interaction/passkey/registration/end', reg))
      localStorage.setItem('passkey_seen', Date())
      return result
    } catch (error) {
      // Check if error because passkey already exists
      if (error instanceof WebAuthnError && error.name === 'InvalidStateError') {
        localStorage.setItem('passkey_seen', Date())
      }
      throw error
    }
  }

  async shouldAskPasskey(user: Partial<Pick<CurrentUserDetails, 'isPrivileged'>>) {
    return user.isPrivileged
      && (await this.getPasskeySupport()).enabled
      && !this.localPasskeySeen()
      && !this.localPasskeySkipped()
  }

  async dialogRegistration() {
    return new Promise<void>((resolve, _reject) => {
      const dialog = this.dialog.open(PasskeyDialog, { disableClose: true })

      dialog.afterClosed().subscribe((result) => {
        if (!result) {
          localStorage.setItem('passkey_skipped', Date())
          resolve()
          return
        }

        this.register().then(() => {
          this.snackbarService.message('Passkey added.')
        }).catch((error: unknown) => {
          if (error instanceof WebAuthnError && error.name === 'InvalidStateError') {
            this.snackbarService.error('Passkey already exists.')
          } else {
            this.snackbarService.error('Could not create Passkey.')
          }
        }).finally(() => {
          this.spinnerService.hide()
          resolve()
        })
      })
    })
  }
}

export type PasskeySupport = {
  enabled: boolean
  platformName?: string
  platformIcon?: string
}

@Component({
  selector: 'app-passkey-dialog',
  imports: [
    MaterialModule,
  ],
  template: `
    <h1 mat-dialog-title>{{ passkeySupport?.platformName ? "Enable " + passkeySupport?.platformName + "?" : "Register Passkey?" }}</h1>
    <mat-dialog-content style="height: 200px; display: flex; justify-content: center; align-items: center;">
      <mat-icon align="center" style="width: 100px; height: 100px; font-size: 100px;" fontSet="material-icons-round" matSuffix>{{ passkeySupport?.platformIcon ?? "key" }}</mat-icon>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Skip</button>
      <button mat-flat-button type="button" [mat-dialog-close]="true" cdkFocusInitial>
        {{ passkeySupport?.platformName ? 'Enable' : "Register" }}
        <mat-icon fontSet="material-icons-round" matSuffix>key</mat-icon>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    
  `,
})
class PasskeyDialog implements OnInit {
  private passkeyService = inject(PasskeyService)
  passkeySupport?: PasskeySupport

  async ngOnInit() {
    this.passkeySupport = await this.passkeyService.getPasskeySupport()
  }
}
