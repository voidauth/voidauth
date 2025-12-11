import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type { UpdateProfile } from '@shared/api-request/UpdateProfile'
import type { UpdateEmail } from '@shared/api-request/UpdateEmail'
import type { UpdatePassword } from '@shared/api-request/UpdatePassword'
import { firstValueFrom } from 'rxjs'
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private http = inject(HttpClient)

  private me?: Promise<CurrentUserDetails>

  async getMyUser(options?: {
    disableCache?: boolean
  }) {
    if (!this.me || !!options?.disableCache) {
      this.me = firstValueFrom(this.http.get<CurrentUserDetails>(`/api/user/me`))
    }

    return this.me
  }

  passkeySession(user: CurrentUserDetails) {
    return user.amr.includes('webauthn')
  }

  async updateProfile(profile: UpdateProfile) {
    return firstValueFrom(this.http.patch<null>('/api/user/profile', profile))
  }

  async updateEmail(emailUpdate: UpdateEmail) {
    return firstValueFrom(this.http.patch<null>('/api/user/email', emailUpdate))
  }

  async passwordStrength(password: string) {
    return firstValueFrom(this.http.post<{ score: 0 | 1 | 2 | 3 | 4 }>('/api/public/passwordStrength', { password }))
  }

  async updatePassword(passwordUpdate: UpdatePassword) {
    return firstValueFrom(this.http.patch<null>('/api/user/password', passwordUpdate))
  }

  async removeAllPasskeys() {
    return firstValueFrom(this.http.delete<null>('/api/user/passkeys'))
  }

  async removePassword() {
    return firstValueFrom(this.http.delete<null>('/api/user/password'))
  }

  async removeAllAuthenticators() {
    return firstValueFrom(this.http.delete<null>('/api/user/totp'))
  }

  async deleteUser() {
    return firstValueFrom(this.http.delete<null>('/api/user/user'))
  }
}
