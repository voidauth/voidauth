import { inject } from '@angular/core'
import { Router, type CanActivateFn } from '@angular/router'
import { UserService } from '../services/user.service'
import { oidcLoginPath } from '@shared/oidc'
import { getBaseHrefPath, getCurrentHost } from '../services/config.service'
import { SpinnerService } from '../services/spinner.service'
import { isAdmin } from '@shared/user'

export const isAdminGuard: CanActivateFn = async (_route, _state) => {
  const userService = inject(UserService)
  const spinnerService = inject(SpinnerService)
  const router = inject(Router)

  try {
    spinnerService.show()
    const user = await userService.getMyUser()
    if (!user.isPrivileged || !isAdmin(user)) {
      // redirect back to home page
      await router.navigate(['/'], {
        replaceUrl: true,
      })
      return false
    }
  } catch (_e) {
    // user isn't logged in
    window.location.assign(getBaseHrefPath() + oidcLoginPath(getCurrentHost(), { prompt: 'login' }))
    return false
  } finally {
    spinnerService.hide()
  }
  return true
}
