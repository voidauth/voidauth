import type { UserDetails } from './api-response/UserDetails'

export const amrFactors = {
  multiFactors: ['email'], // something that should already require mfa to access
  firstFactors: ['pwd'], // something you know (password, PIN)
  secondFactors: ['totp', 'webauthn_v'], // something you have or are (device, biometrics)
  eitherFactors: ['webauthn'], // something that can be either first or second factor depending on context
}

export function loginFactors(amr: string[]) {
  // clone the amr so we don't modify the original by accident
  amr = [...amr]

  // Multi-factor AMRs allow access always
  if (amr.some(f => amrFactors.multiFactors.includes(f))) {
    return 2
  }

  // Single-factor AMRs allow access if mfa is not required, or if there is a second factor
  const firstFactor = amr.find(f => amrFactors.firstFactors.includes(f)) || amr.find(f => amrFactors.eitherFactors.includes(f))
  if (firstFactor) {
    amr = amr.filter(f => f !== firstFactor)
    if (amr.some(f => amrFactors.secondFactors.includes(f)) || amr.some(f => amrFactors.eitherFactors.includes(f))) {
      return 2
    }
    return 1
  }

  return 0
}

export function isUnapproved(user: Pick<UserDetails, 'approved' | 'isAdmin'>, SIGNUP_REQUIRES_APPROVAL: boolean) {
  return !user.isAdmin && SIGNUP_REQUIRES_APPROVAL && !user.approved
}

export function isExpired(user: Pick<UserDetails, 'expiresAt' | 'isAdmin'>) {
  return !user.isAdmin && !!user.expiresAt && new Date(user.expiresAt) < new Date()
}

export function isUnverifiedEmail(user: Pick<UserDetails, 'hasEmail' | 'emailVerified' | 'isAdmin'>, EMAIL_VERIFICATION: boolean) {
  return !user.isAdmin && EMAIL_VERIFICATION && (!user.hasEmail || !user.emailVerified)
}
