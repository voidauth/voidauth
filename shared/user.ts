import type { UserDetails } from './api-response/UserDetails'
import { ADMIN_GROUP } from './constants'

export const amrFactors = {
  multiFactors: ['email', 'webauthn'], // something that should already require mfa to access
  firstFactors: ['pwd'], // something you know (password, PIN)
  secondFactors: ['totp'], // something you have or are (device, biometrics)
}

export function loginFactors(amr: string[]) {
  // Multi-factor AMRs allow access always
  if (amr.some(f => amrFactors.multiFactors.includes(f))) {
    return 2
  }

  // Single-factor AMRs allow access if mfa is not required, or if there is a second factor
  if (amr.some(f => amrFactors.firstFactors.includes(f))) {
    if (amr.some(f => amrFactors.secondFactors.includes(f))) {
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
