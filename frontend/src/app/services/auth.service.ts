import { inject, Injectable } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { firstValueFrom } from "rxjs"
import type { RegisterUser } from "@shared/api-request/RegisterUser"
import type { LoginUser } from "@shared/api-request/LoginUser"
import type { VerifyUserEmail } from "@shared/api-request/VerifyUserEmail"
import type { Redirect } from "@shared/api-response/Redirect"
import type { ConsentDetails } from "@shared/api-response/ConsentDetails"
import type { InvitationDetails } from "@shared/api-response/InvitationDetails"
import { type Nullable } from "@shared/utils"
import type { SendPasswordResetResponse } from "@shared/api-response/SendPasswordResetResponse"
import type { ResetPassword } from "@shared/api-request/ResetPassword"

@Injectable({
  providedIn: "root",
})
export class AuthService {
  private http = inject(HttpClient)

  async getInteractionDetails(uid: string) {
    return firstValueFrom(this.http.get<ConsentDetails>(`/api/interaction/${uid}/detail`))
  }

  async interactionExists() {
    return firstValueFrom(this.http.get<null>("/api/interaction/exists"))
  }

  async register(body: Nullable<RegisterUser>) {
    return firstValueFrom(this.http.post<Redirect>("/api/interaction/register", body))
  }

  async login(body: LoginUser) {
    return firstValueFrom(this.http.post<Redirect>("/api/interaction/login", body))
  }

  async consent(uid: string) {
    return firstValueFrom(this.http.post<null>(`/api/interaction/${uid}/confirm`, null))
  }

  async verifyEmail(body: VerifyUserEmail) {
    return firstValueFrom(this.http.post<Redirect>("/api/interaction/verify_email", body))
  }

  async sendEmailVerification(body: { id: string }) {
    return firstValueFrom(this.http.post<Redirect>("/api/auth/send_verify_email", body))
  }

  async getInviteDetails(id: string, challenge: string) {
    return firstValueFrom(this.http.get<InvitationDetails>(`/api/auth/invitation/${id}/${challenge}`))
  }

  async sendPasswordReset(input: string) {
    return firstValueFrom(this.http.post<SendPasswordResetResponse>("/api/public/send_password_reset", { input }))
  }

  async resetPassword(body: ResetPassword) {
    return firstValueFrom(this.http.post<SendPasswordResetResponse>("/api/public/reset_password", body))
  }
}
