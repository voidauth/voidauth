import { inject } from '@angular/core'
import { Router, type CanActivateFn } from '@angular/router'
import { UserService } from '../services/user.service'
import { SpinnerService } from '../services/spinner.service'
import { REDIRECT_PATHS } from '@shared/constants'

export const PrivilegedGuard: CanActivateFn = async (_route, _state) => {
  const userService = inject(UserService)
  const spinnerService = inject(SpinnerService)
  const router = inject(Router)

  try {
    spinnerService.show()
    const user = await userService.getMyUser()
    if (!user.isPrivileged) {
      throw new Error('User does not have AMR required to use account management or admin features.')
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
