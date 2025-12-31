import { inject } from '@angular/core'
import { Router, type CanActivateFn } from '@angular/router'
import { UserService } from '../services/user.service'
import { SpinnerService } from '../services/spinner.service'
import { isAdmin } from '@shared/user'
import { REDIRECT_PATHS } from '@shared/constants'

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
    // redirect to login page
    await router.navigate([REDIRECT_PATHS.LOGIN], {
      replaceUrl: true,
    })
    return false
  } finally {
    spinnerService.hide()
  }
  return true
}
