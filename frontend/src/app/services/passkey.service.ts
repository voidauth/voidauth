import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import {
  browserSupportsWebAuthn, platformAuthenticatorIsAvailable, WebAuthnError, type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/browser'
import type { Redirect } from '@shared/api-response/Redirect'
import { UAParser } from 'ua-parser-js'

@Injectable({
  providedIn: 'root',
})
export class PasskeyService {
  private http = inject(HttpClient)

  /**
   * Checks if passkey registration or usage has ever been flagged in localStorage.
   * Not a perfect solution, but until there is a method to check if a device passkey exists,
   * this will have to do. This is just a hint and should not disable any functionality.
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

  async getRegistrationOptions() {
    return firstValueFrom(this.http.post<PublicKeyCredentialCreationOptionsJSON>('/api/passkey/registration/start', null))
  }

  async sendRegistration(reg: RegistrationResponseJSON) {
    try {
      const result = await firstValueFrom(this.http.post<null>('/api/passkey/registration/end', reg))
      localStorage.setItem('passkey_seen', 'true')
      return result
    } catch (error) {
      if (error instanceof WebAuthnError && error.name === 'InvalidStateError') {
        localStorage.setItem('passkey_seen', 'true')
      }
      throw error
    }
  }

  async getAuthOptions() {
    return firstValueFrom(this.http.post<PublicKeyCredentialRequestOptionsJSON>('/api/interaction/passkey/start', null))
  }

  async sendAuth(auth: AuthenticationResponseJSON) {
    const result = firstValueFrom(this.http.post<Redirect>('/api/interaction/passkey/end', auth))
    localStorage.setItem('passkey_seen', 'true')
    return result
  }
}

export type PasskeySupport = {
  enabled: boolean
  platformName?: string
  platformIcon?: string
}
