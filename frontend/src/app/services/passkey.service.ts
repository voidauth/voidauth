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

  private seenKey(ecosystem?: string) {
    return ecosystem ? `passkey_seen_${ecosystem}` : 'passkey_seen'
  }

  private skippedKey(ecosystem?: string) {
    return ecosystem ? `passkey_skipped_${ecosystem}` : 'passkey_skipped'
  }

  /**
   * Falls back to the legacy unkeyed flag so existing users are not re-prompted after migration
   */
  localPasskeySeen(ecosystem?: string) {
    if (ecosystem && localStorage.getItem(this.seenKey(ecosystem))) return true
    return !!localStorage.getItem('passkey_seen')
  }

  /**
   * Falls back to the legacy unkeyed flag so existing users are not re-prompted after migration
   */
  localPasskeySkipped(ecosystem?: string) {
    if (ecosystem && localStorage.getItem(this.skippedKey(ecosystem))) return true
    return !!localStorage.getItem('passkey_skipped')
  }

  resetPasskeySeen() {
    localStorage.removeItem('passkey_seen')
  }

  resetPasskeySkipped() {
    localStorage.removeItem('passkey_skipped')
  }

  static getEcosystem(osName: string): string | undefined {
    switch (osName) {
      // iOS and macOS share iCloud Keychain, so treat them as the same ecosystem
      case 'iOS':
      case 'macOS':
        return 'apple'
      case 'Windows':
        return 'windows'
      case 'Android':
        return 'android'
      default:
        return undefined
    }
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
    let ecosystem: string | undefined
    if (await platformAuthenticatorIsAvailable()) {
      const { os } = UAParser(navigator.userAgent)
      const osName = os.name ?? ''
      const platformInfo = PasskeyService.getPlatform(osName)
      name = platformInfo?.platformName
      icon = platformInfo?.platformIcon
      ecosystem = PasskeyService.getEcosystem(osName)
    }

    return {
      enabled: true,
      platformName: name,
      platformIcon: icon,
      ecosystem,
    }
  }

  private async getAuthOptions(requireVerified?: boolean) {
    return firstValueFrom(this.http.post<PublicKeyCredentialRequestOptionsJSON>('/api/interaction/passkey/start', { requireVerified }))
  }

  async updatePasskey(passkey_id: string, displayName: string) {
    return firstValueFrom(this.http.patch<null>(`/api/interaction/passkey/${passkey_id}`, { displayName }))
  }

  private async sendAuth(auth: AuthenticationResponseJSON, remember?: boolean, ecosystem?: string) {
    const result = firstValueFrom(this.http.post<Redirect | undefined>('/api/interaction/passkey/end', {
      ...auth,
      remember,
    }))
    localStorage.setItem(this.seenKey(ecosystem), Date())
    return result
  }

  async login(opts: { remember?: boolean, requireVerified?: boolean } = {}) {
    const { remember = false, requireVerified } = opts
    const { ecosystem } = await this.getPasskeySupport()
    const optionsJSON = await this.getAuthOptions(requireVerified)
    const auth = await startAuthentication({ optionsJSON })
    return await this.sendAuth(auth, remember, ecosystem)
  }

  async register(opts: { requireVerified?: boolean } = {}) {
    const { requireVerified } = opts
    const { ecosystem } = await this.getPasskeySupport()

    const options = await firstValueFrom(this.http.post<PublicKeyCredentialCreationOptionsJSON>(
      '/api/interaction/passkey/registration/start',
      { requireVerified },
    ))
    const reg = await startRegistration({ optionsJSON: options })
    try {
      const result = await firstValueFrom(this.http.post<PasskeyRegisterResponse>(
        '/api/interaction/passkey/registration/end',
        { ...reg, ecosystem },
      ))
      localStorage.setItem(this.seenKey(ecosystem), Date())

      await this.openNamingDialog(result.passkeyId)

      return result
    } catch (error) {
      // Check if error because passkey already exists
      if (error instanceof WebAuthnError && error.name === 'InvalidStateError') {
        localStorage.setItem(this.seenKey(ecosystem), Date())
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

  async shouldAskPasskey(user: Partial<Pick<CurrentUserDetails, 'hasPasskeys' | 'passkeyEcosystems' | 'passkeySkippedEcosystems'>>) {
    const support = await this.getPasskeySupport()
    if (!support.enabled) return false

    const { ecosystem } = support

    if (ecosystem && user.passkeyEcosystems?.includes(ecosystem)) return false
    if (this.localPasskeySeen(ecosystem)) return false
    if (ecosystem && user.passkeySkippedEcosystems?.includes(ecosystem)) return false
    if (this.localPasskeySkipped(ecosystem)) return false

    return true
  }

  async dialogRegistration() {
    const { ecosystem } = await this.getPasskeySupport()

    return new Promise<void>((resolve, _reject) => {
      const dialog = this.dialog.open(PasskeyDialog, { disableClose: true })

      dialog.afterClosed().subscribe((result) => {
        if (!result) {
          localStorage.setItem(this.skippedKey(ecosystem), Date())
          if (ecosystem) {
            firstValueFrom(this.http.post('/api/user/passkey/skip', { ecosystem })).catch(() => {})
          }
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
  ecosystem?: string
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
