import { inject } from "@angular/core"
import { type CanActivateFn } from "@angular/router"
import { UserService } from "../services/user.service"
import { oidcLoginPath } from "@shared/oidc"
import { ConfigService } from "../services/config.service"

export const isAdminGuard: CanActivateFn = async (_route, _state) => {
  const userService = inject(UserService)
  const configService = inject(ConfigService)
  try {
    const user = await userService.getMyUser()
    if (!userService.userIsAdmin(user)) {
      return false
    }
  } catch (_e) {
    // user isn't logged in
    window.location.assign(oidcLoginPath(configService.getCurrentHost() + "/api/status"))
    return false
  }
  return true
}
