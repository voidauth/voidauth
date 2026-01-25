import type { UserDetails } from '@shared/api-response/UserDetails'
import { isUnapproved, isUnverified, loginFactors } from '@shared/user'
import { userRequiresMfa } from '../db/user'
import appConfig from './config'

/**
 * Determines if a user can login.
 * Checks that session has required factors, user is approved, and email is verified (if required)
 */
export function userCanLogin(user: UserDetails | undefined, amr: string[]): user is UserDetails {
  if (!user) {
    return false
  }

  const factors = loginFactors(amr)

  if (factors === 0) {
    return false
  }

  if (userRequiresMfa(user) && factors < 2) {
    return false
  }

  if (isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL) || isUnverified(user, !!appConfig.EMAIL_VERIFICATION)) {
    return false
  }

  return true
}
