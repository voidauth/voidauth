import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import environment from '../../environment/environment'
import { firstValueFrom } from 'rxjs';
import type { RegisterUser } from '@shared/api-request/RegisterUser';
import type { LoginUser } from '@shared/api-request/LoginUser';
import type { VerifyUserEmail } from '@shared/api-request/VerifyUserEmail';
import type { Redirect } from '@shared/api-response/Redirect';
import type { ConsentDetails } from '@shared/api-response/ConsentDetails';
import type { InvitationDetails } from '@shared/api-response/InvitationDetails';
import { ConfigService } from './config.service';
import type { Nullable } from '@shared/utils';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private configService = inject(ConfigService)
  private http = inject(HttpClient)

  constructor() {}

  getLoginRedirect() {
    const redirectUri = this.configService.getCurrentHost()
    return `/oidc/auth?client_id=unknown_auth_internal_client&response_type=none&scope=openid&redirect_uri=${redirectUri}/api/status`
  }

  async getInteractionDetails(uid: string) {
    return firstValueFrom(this.http.get<ConsentDetails>(`${environment.apiUrl}/interaction/${uid}/detail`))
  }

  async register(body: Partial<Nullable<RegisterUser>>) {
    return firstValueFrom(this.http.post<Redirect>(`${environment.apiUrl}/interaction/register`, body));
  }

  async login(body: LoginUser) {
    return firstValueFrom(this.http.post<Redirect>(`${environment.apiUrl}/interaction/login`, body));
  }

  async consent(uid: string) {
    return firstValueFrom(this.http.post<void>(`${environment.apiUrl}/interaction/${uid}/confirm`, null));
  }

  async verifyEmail(body: VerifyUserEmail) {
    return firstValueFrom(this.http.post<Redirect>(`${environment.apiUrl}/interaction/verify_email`, body))
  }

  async sendEmailVerification(body: { id: string }) {
    return firstValueFrom(this.http.post<Redirect>(`${environment.apiUrl}/auth/send_verify_email`, body))
  }

  async getInviteDetails(id: string, challenge: string) {
    return firstValueFrom(this.http.get<InvitationDetails>(`${environment.apiUrl}/auth/invitation/${id}/${challenge}`))
  }
}