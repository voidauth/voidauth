import { inject } from "@angular/core"
import { type CanActivateFn } from "@angular/router"
import { oidcLoginPath } from "@shared/oidc"
import { UserService } from "../services/user.service"
import { ConfigService } from "../services/config.service"

export const loggedInGuard: CanActivateFn = async (_route, _state) => {
  const userService = inject(UserService)
  const configService = inject(ConfigService)
  try {
    await userService.getMyUser()
  } catch (_e) {
    // user isn't logged in
    window.location.assign(oidcLoginPath(configService.getCurrentHost() + "/api/status"))
    return false
  }
  return true
}
