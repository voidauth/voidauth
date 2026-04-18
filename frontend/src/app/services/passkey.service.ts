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
import { TranslatePipe } from '@ngx-translate/core'
import { PasskeyNameDialog } from '../dialogs/passkey-name/passkey-name.component'
import type { PasskeyRegisterResponse } from '@shared/api-response/PasskeyRegisterResponse'

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

  static getPlatform(osName: string): Pick<PasskeySupport, 'platformName' | 'platformIcon'> | null {
    switch (osName) {
      // case 'Windows':
      //   return { platformName: 'Windows Hello', platformIcon: 'sentiment_satisfied' }
      case 'iOS':
        return { platformName: 'Face ID', platformIcon: 'face' }
      case 'macOS':
        return { platformName: 'Touch ID', platformIcon: 'fingerprint' }
      default:
        return null
    }
  }

  async getPasskeySupport(): Promise<PasskeySupport> {
    if (!browserSupportsWebAuthn()) {
      return {
        enabled: false,
      }
    }

    let name: PasskeySupport['platformName']
    let icon: string | undefined
    if (await platformAuthenticatorIsAvailable()) {
      const { os } = UAParser(navigator.userAgent)
      const platformInfo = PasskeyService.getPlatform(os.name ?? '')
      name = platformInfo?.platformName
      icon = platformInfo?.platformIcon
    }

    return {
      enabled: true,
      platformName: name,
      platformIcon: icon,
    }
  }

  private async getAuthOptions(requireVerified?: boolean) {
    return firstValueFrom(this.http.post<PublicKeyCredentialRequestOptionsJSON>('/api/interaction/passkey/start', { requireVerified }))
  }

  async updatePasskey(passkey_id: string, displayName: string) {
    return firstValueFrom(this.http.patch<null>(`/api/interaction/passkey/${passkey_id}`, { displayName }))
  }

  private async sendAuth(auth: AuthenticationResponseJSON, remember?: boolean) {
    const result = firstValueFrom(this.http.post<Redirect | undefined>('/api/interaction/passkey/end', {
      ...auth,
      remember,
    }))
    localStorage.setItem('passkey_seen', Date())
    return result
  }

  async login(opts: { remember?: boolean, requireVerified?: boolean } = {}) {
    const { remember = false, requireVerified } = opts
    const optionsJSON = await this.getAuthOptions(requireVerified)
    const auth = await startAuthentication({ optionsJSON })
    return await this.sendAuth(auth, remember)
  }

  async register(opts: { requireVerified?: boolean } = {}) {
    const { requireVerified } = opts

    const options = await firstValueFrom(this.http.post<PublicKeyCredentialCreationOptionsJSON>(
      '/api/interaction/passkey/registration/start',
      { requireVerified },
    ))
    const reg = await startRegistration({ optionsJSON: options })
    try {
      const result = await firstValueFrom(this.http.post<PasskeyRegisterResponse>('/api/interaction/passkey/registration/end', reg))
      localStorage.setItem('passkey_seen', Date())

      await this.openNamingDialog(result.passkeyId)

      return result
    } catch (error) {
      // Check if error because passkey already exists
      if (error instanceof WebAuthnError && error.name === 'InvalidStateError') {
        localStorage.setItem('passkey_seen', Date())
      }
      throw error
    }
  }

  async openNamingDialog(passkeyId: string) {
    return new Promise<void>((resolve, _reject) => {
      this.spinnerService.hide()
      const nameDialogRef = this.dialog.open(PasskeyNameDialog, { disableClose: true })
      nameDialogRef.afterClosed().subscribe((displayName: string | null) => {
        if (displayName) {
          this.spinnerService.show()
          this.updatePasskey(passkeyId, displayName).then(() => {
            this.snackbarService.message('Passkey added.')
          }).catch(() => {
            this.snackbarService.error('Passkey created, but could not set name.')
          }).finally(() => {
            this.spinnerService.hide()
            resolve()
          })
        } else {
          this.snackbarService.message('Passkey added.')
          resolve()
        }
      })
    })
  }

  async shouldAskPasskey(user: Partial<Pick<CurrentUserDetails, 'isPrivileged' | 'hasPasskeys'>>) {
    return user.isPrivileged
      // && !user.hasPasskeys // Only ask to create a passkey if the user has none. Need to think about this.
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

        this.spinnerService.show()

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
  platformName?: 'Face ID' | 'Touch ID'
  platformIcon?: string
}

@Component({
  selector: 'app-passkey-dialog',
  imports: [
    MaterialModule,
    TranslatePipe,
  ],
  template: `
    <h1 mat-dialog-title>{{ 'passkey-dialog.title' | translate:{ platformName: passkeySupport?.platformName ?? ("passkey-title" | translate) } }}</h1>
    <mat-dialog-content style="height: 200px; display: flex; justify-content: center; align-items: center;">
      <mat-icon align="center" style="width: 100px; height: 100px; font-size: 100px;" fontSet="material-icons-round" matSuffix>{{ passkeySupport?.platformIcon ?? "key" }}</mat-icon>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Skip</button>
      <button mat-flat-button type="button" [mat-dialog-close]="true" cdkFocusInitial>
        {{ 'passkey-dialog.actions.passkey' | translate:{ platformName: passkeySupport?.platformName ?? ("passkey-title" | translate) } }}
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
