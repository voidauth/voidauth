import type { UserDetails } from './api-response/UserDetails'

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

export function isUnapproved(user: Pick<UserDetails, 'approved' | 'isAdmin' | 'expiresAt'>, SIGNUP_REQUIRES_APPROVAL: boolean) {
  return !user.isAdmin && SIGNUP_REQUIRES_APPROVAL
}

export function isExpired(user: Pick<UserDetails, 'expiresAt' | 'isAdmin'>) {
  return !user.isAdmin && !!user.expiresAt && new Date(user.expiresAt) < new Date()
}

export function isUnverifiedEmail(user: Pick<UserDetails, 'hasEmail' | 'emailVerified' | 'isAdmin'>, EMAIL_VERIFICATION: boolean) {
  return !user.isAdmin && EMAIL_VERIFICATION && (!user.hasEmail || !user.emailVerified)
}
