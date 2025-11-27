import { inject } from '@angular/core'
import { type CanActivateFn } from '@angular/router'
import { oidcLoginPath } from '@shared/oidc'
import { UserService } from '../services/user.service'
import { getBaseHrefPath, getCurrentHost } from '../services/config.service'
import { SpinnerService } from '../services/spinner.service'

export const PrivilegedGuard: CanActivateFn = async (_route, _state) => {
  const userService = inject(UserService)
  const spinnerService = inject(SpinnerService)

  try {
    spinnerService.show()
    const user = await userService.getMyUser()
    if (!user.isPrivileged) {
      throw new Error('User does not have AMR required to use admin or account management features.')
    }
  } catch (_e) {
    // user isn't logged in
    window.location.assign(getBaseHrefPath() + oidcLoginPath(getCurrentHost()))
    return false
  } finally {
    spinnerService.hide()
  }
  return true
}
