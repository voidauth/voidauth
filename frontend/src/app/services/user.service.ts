import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type { UpdateProfile } from '@shared/api-request/UpdateProfile'
import type { UpdateEmail } from '@shared/api-request/UpdateEmail'
import type { UpdatePassword } from '@shared/api-request/UpdatePassword'
import { firstValueFrom } from 'rxjs'
import type { CurrentUserDetails, UserDetails } from '@shared/api-response/UserDetails'
import { ADMIN_GROUP } from '@shared/constants'

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private http = inject(HttpClient)

  async getMyUser() {
    return firstValueFrom(this.http.get<CurrentUserDetails>('/api/user/me'))
  }

  userIsAdmin(user: Pick<UserDetails, 'groups'>) {
    return user.groups.some(g => g === ADMIN_GROUP)
  }

  passkeySession(user: CurrentUserDetails) {
    return !!user.amr?.includes('webauthn')
  }

  async updateProfile(profile: UpdateProfile) {
    return firstValueFrom(this.http.patch<null>('/api/user/profile', profile))
  }

  async updateEmail(emailUpdate: UpdateEmail) {
    return firstValueFrom(this.http.patch<null>('/api/user/email', emailUpdate))
  }

  async updatePassword(passwordUpdate: UpdatePassword) {
    return firstValueFrom(this.http.patch<null>('/api/user/password', passwordUpdate))
  }
}
