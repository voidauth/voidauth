import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { firstValueFrom } from 'rxjs'
import type { RegisterUser } from '@shared/api-request/RegisterUser'
import type { LoginUser } from '@shared/api-request/LoginUser'
import type { VerifyUserEmail } from '@shared/api-request/VerifyUserEmail'
import type { Redirect } from '@shared/api-response/Redirect'
import type { ConsentDetails } from '@shared/api-response/ConsentDetails'
import type { InvitationDetails } from '@shared/api-response/InvitationDetails'
import { type Nullable } from '@shared/utils'
import type { SendPasswordResetResponse } from '@shared/api-response/SendPasswordResetResponse'
import type { ResetPassword } from '@shared/api-request/ResetPassword'
import { type RegistrationResponseJSON, type PublicKeyCredentialCreationOptionsJSON, WebAuthnError } from '@simplewebauthn/browser'
import type { RegisterTotpResponse } from '@shared/api-response/RegisterTotpResponse'
import type { InteractionInfo } from '@shared/api-response/InteractionInfo'
import { oidcLoginPath } from '@shared/oidc'
import { getCurrentHost } from './config.service'

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient)

  async getInteractionDetails(uid: string) {
    return firstValueFrom(this.http.get<ConsentDetails>(`/api/interaction/${uid}/detail`))
  }

  async interactionExists() {
    return firstValueFrom(this.http.get<InteractionInfo>('/api/interaction/exists'))
  }

  async createInteraction() {
    try {
      await firstValueFrom(this.http.get<null>(oidcLoginPath(getCurrentHost(), {
        prompt: 'login',
      }), {
        redirect: 'manual',
      }))
    } catch (_e) {
      // do nothing
    }
  }

  async cancelInteraction() {
    return firstValueFrom(this.http.delete<null>('/api/interaction/current'))
  }

  async register(body: Nullable<RegisterUser>) {
    return firstValueFrom(this.http.post<Redirect | undefined>('/api/interaction/register', body))
  }

  async startPasskeySignup(inviteId?: string, challenge?: string) {
    return firstValueFrom(this.http.post<PublicKeyCredentialCreationOptionsJSON>('/api/interaction/register/passkey/start', {
      inviteId,
      challenge,
    }))
  }

  async endPasskeySignup(body: Nullable<RegistrationResponseJSON & Omit<RegisterUser, 'password'>>) {
    try {
      const result = await firstValueFrom(this.http.post<Redirect | undefined>('/api/interaction/register/passkey/end', body))
      localStorage.setItem('passkey_seen', 'true')
      return result
    } catch (error) {
      if (error instanceof WebAuthnError && error.name === 'InvalidStateError') {
        localStorage.setItem('passkey_seen', 'true')
      }
      throw error
    }
  }

  async login(body: LoginUser) {
    return firstValueFrom(this.http.post<Redirect | undefined>('/api/interaction/login', body))
  }

  async consent(uid: string) {
    return firstValueFrom(this.http.post<null>(`/api/interaction/${uid}/confirm`, null))
  }

  async verifyEmail(body: VerifyUserEmail) {
    return firstValueFrom(this.http.post<Redirect | undefined>('/api/interaction/verify_email', body))
  }

  async sendEmailVerification(body: { id: string }) {
    return firstValueFrom(this.http.post<Redirect | undefined>('/api/auth/send_verify_email', body))
  }

  async getInviteDetails(id: string, challenge: string) {
    return firstValueFrom(this.http.get<InvitationDetails>(`/api/auth/invitation/${id}/${challenge}`))
  }

  async sendPasswordReset(input: string) {
    return firstValueFrom(this.http.post<SendPasswordResetResponse>('/api/public/send_password_reset', { input }))
  }

  async resetPassword(body: ResetPassword) {
    return firstValueFrom(this.http.post<null>('/api/public/reset_password', body))
  }

  async resetPasswordPasskeyStart(body: Omit<ResetPassword, 'newPassword'>) {
    return firstValueFrom(this.http.post<PublicKeyCredentialCreationOptionsJSON>('/api/public/reset_password/passkey/start', body))
  }

  async resetPasswordPasskeyEnd(body: Omit<ResetPassword, 'newPassword'> & RegistrationResponseJSON) {
    try {
      const result = await firstValueFrom(this.http.post<null>('/api/public/reset_password/passkey/end', body))
      localStorage.setItem('passkey_seen', 'true')
      return result
    } catch (error) {
      if (error instanceof WebAuthnError && error.name === 'InvalidStateError') {
        localStorage.setItem('passkey_seen', 'true')
      }
      throw error
    }
  }

  async registerTotp() {
    return firstValueFrom(this.http.post<RegisterTotpResponse>('/api/interaction/totp/registration', null))
  }

  async verifyTotp(token: string, enableMfa: boolean) {
    return firstValueFrom(this.http.post<Redirect | undefined>('/api/interaction/totp', { token, enableMfa }))
  }
}
