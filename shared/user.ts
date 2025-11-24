import type { UserDetails } from './api-response/UserDetails'
import { ADMIN_GROUP } from './constants'

export function loginFactors(amr: string[]) {
  const multiFactors = ['email', 'webauthn'] // something that should already require mfa to access
  const firstFactors = ['pwd'] // something you know (password, PIN)
  const secondFactors = ['totp'] // something you have or are (device, biometrics)

  // Multi-factor AMRs allow access always
  if (amr.some(f => multiFactors.includes(f))) {
    return 2
  }

  // Single-factor AMRs allow access if mfa is not required, or if there is a second factor
  if (amr.some(f => firstFactors.includes(f))) {
    if (amr.some(f => secondFactors.includes(f))) {
      return 2
    }
    return 1
  }

  return 0
}

export function isAdmin(user: Pick<UserDetails, 'groups'> | undefined) {
  return !!user?.groups.map(g => g.name).includes(ADMIN_GROUP)
}

export function isUnapproved(user: Pick<UserDetails, 'approved' | 'groups'>, SIGNUP_REQUIRES_APPROVAL: boolean) {
  return !isAdmin(user) && SIGNUP_REQUIRES_APPROVAL && !user.approved
}

export function isUnverified(user: Pick<UserDetails, 'email' | 'emailVerified' | 'groups'>, EMAIL_VERIFICATION: boolean) {
  return !isAdmin(user) && EMAIL_VERIFICATION && (!user.email || !user.emailVerified)
}
