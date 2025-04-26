import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import type { UpdateProfile } from '@shared/api-request/UpdateProfile'
import type { UpdateEmail } from '@shared/api-request/UpdateEmail'
import type { UpdatePassword } from '@shared/api-request/UpdatePassword'
import { firstValueFrom } from 'rxjs'
import environment from '../../environment/environment'
import type { UserDetails } from '@shared/api-response/UserDetails'

@Injectable({
  providedIn: 'root',
})
export class UserService {
  constructor(private http: HttpClient) { }

  async getMyUser() {
    return firstValueFrom(this.http.get<UserDetails>(`${environment.apiUrl}/user/me`))
  }

  async updateProfile(profile: UpdateProfile) {
    return firstValueFrom(this.http.patch<null>(`${environment.apiUrl}/user/profile`, profile))
  }

  async updateEmail(emailUpdate: UpdateEmail) {
    return firstValueFrom(this.http.patch<null>(`${environment.apiUrl}/user/email`, emailUpdate))
  }

  async updatePassword(passwordUpdate: UpdatePassword) {
    return firstValueFrom(this.http.patch<null>(`${environment.apiUrl}/user/password`, passwordUpdate))
  }
}
