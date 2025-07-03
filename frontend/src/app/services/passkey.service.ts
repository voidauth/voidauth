import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import type { Redirect } from '@shared/api-response/Redirect'
import { UAParser } from 'ua-parser-js'

@Injectable({
  providedIn: 'root',
})
export class PasskeyService {
  private http = inject(HttpClient)

  /**
   * Checks if passkey registration or usage has ever been and flagged in localStorage.
   * Not a perfect solution, but until there is a method to check if a device passkey exists,
   * this will have to do.
   * @returns if there is passkey usage flagged in localStorage
   */
  localPasskeySeen() {
    return localStorage.getItem('passkey_seen') === 'true'
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
      if (os.name == 'Windows') {
        name = 'Windows Hello'
        icon = 'sentiment_satisfied'
      } else if (os.name == 'iOS') {
        name = 'Face ID'
        icon = 'face'
      } else if (os.name == 'MacOS') {
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

  async getRegistrationOptions() {
    return firstValueFrom(this.http.get<PublicKeyCredentialCreationOptionsJSON>('/api/passkey/registration'))
  }

  async sendRegistration(reg: unknown) {
    const result = firstValueFrom(this.http.post<null>('/api/passkey/registration', reg))
    localStorage.setItem('passkey_seen', 'true')
    return result
  }

  async getAuthOptions() {
    return firstValueFrom(this.http.get<PublicKeyCredentialRequestOptionsJSON>('/api/interaction/passkey'))
  }

  async sendAuth(auth: AuthenticationResponseJSON) {
    const result = firstValueFrom(this.http.post<Redirect>('/api/interaction/passkey', auth))
    localStorage.setItem('passkey_seen', 'true')
    return result
  }
}

export type PasskeySupport = {
  enabled: boolean
  platformName?: string
  platformIcon?: string
}
