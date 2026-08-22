import type { UserDetails } from './api-response/UserDetails'
import { stringCompare } from './utils'

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

type TrackedCustomClaim = { claim: string, value: string, groupId?: string }
export function calculateCustomClaims(user: Pick<UserDetails, 'customClaims' | 'groups'>): TrackedCustomClaim[] {
  // Must get the list of all user claims, then group claims. There can be no duplicate claims,
  // and group claims should be sorted by group name and keep track of which group they came from.
  // User claims take priority over group claims, as they are more specific to the user.
  const claims: TrackedCustomClaim[] = []
  const groupClaims = user.groups.sort((a, b) => stringCompare(a.name, b.name)).flatMap(g =>
    g.customClaims.map(c => ({ claim: c.claim, value: c.value, groupId: g.id })),
  )
  const userClaims = user.customClaims.map(c => ({ claim: c.claim, value: c.value }))
  const allClaims = userClaims.concat(groupClaims)
  const seen = new Set<string>()
  for (const c of allClaims) {
    if (!seen.has(c.claim)) {
      claims.push(c)
      seen.add(c.claim)
    }
  }
  return claims
}
