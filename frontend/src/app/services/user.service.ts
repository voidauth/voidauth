import { HttpClient } from "@angular/common/http"
import { Injectable } from "@angular/core"
import type { UpdateProfile } from "@shared/api-request/UpdateProfile"
import type { UpdateEmail } from "@shared/api-request/UpdateEmail"
import type { UpdatePassword } from "@shared/api-request/UpdatePassword"
import { firstValueFrom } from "rxjs"
import type { UserDetails } from "@shared/api-response/UserDetails"
import { ADMIN_GROUP } from "@shared/constants"

@Injectable({
  providedIn: "root",
})
export class UserService {
  constructor(private http: HttpClient) { }

  async getMyUser() {
    return firstValueFrom(this.http.get<UserDetails>("/api/user/me"))
  }

  userIsAdmin(user: UserDetails) {
    return user.groups.some(g => g === ADMIN_GROUP)
  }

  async updateProfile(profile: UpdateProfile) {
    return firstValueFrom(this.http.patch<null>("/api/user/profile", profile))
  }

  async updateEmail(emailUpdate: UpdateEmail) {
    return firstValueFrom(this.http.patch<null>("/api/user/email", emailUpdate))
  }

  async updatePassword(passwordUpdate: UpdatePassword) {
    return firstValueFrom(this.http.patch<null>("/api/user/password", passwordUpdate))
  }
}
