import { inject } from '@angular/core'
import { type CanActivateFn } from '@angular/router'
import { UserService } from '../services/user.service'
import { oidcLoginPath } from '@shared/oidc'
import { ConfigService } from '../services/config.service'
import { SpinnerService } from '../services/spinner.service'

export const isAdminGuard: CanActivateFn = async (_route, _state) => {
  const userService = inject(UserService)
  const configService = inject(ConfigService)
  const spinnerService = inject(SpinnerService)

  try {
    spinnerService.show()
    const user = await userService.getMyUser()
    if (!userService.userIsAdmin(user)) {
      window.location.assign('/')
      return false
    }
  } catch (_e) {
    // user isn't logged in
    window.location.assign(oidcLoginPath(configService.getCurrentHost() + '/api/cb'))
    return false
  } finally {
    spinnerService.hide()
  }
  return true
}
