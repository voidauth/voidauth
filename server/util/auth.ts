import type { UserDetails } from '@shared/api-response/UserDetails'
import { availableLoginFactors, isExpired, isUnapproved, isUnverifiedEmail, loginFactors, type amrFactor } from '@shared/user'
import appConfig from './config'

function userCanMfa(user: UserDetails) {
  return loginFactors(availableLoginFactors(user)) > 1
}

/**
 * Determines if a user can login.
 * Checks that session has required factors, user is approved, and email is verified (if required)
 */
export function userCanLogin(
  user: Pick<UserDetails, 'mfaRequired' | 'hasMfaGroup' | 'hasTotp' | 'hasEmail' | 'emailVerified' | 'approved' | 'isAdmin'> | undefined,
  amr: amrFactor[],
): user is UserDetails {
  if (!user) {
    return false
  }

  // If user has no factors, they cannot login
  if (!loginFactors(amr)) {
    return false
  }

  // If user has MFA enabled, they must have it completed
  if (user.mfaRequired && loginFactors(amr) < 2) {
    return false
  }

  // If user is required to have MFA, they must have it enabled
  if ((user.hasMfaGroup || appConfig.MFA_REQUIRED) && !user.mfaRequired) {
    return false
  }

  // Users must be approved to login if required by config
  if (isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL)) {
    return false
  }

  // Users must not be expired to login
  if (isExpired(user)) {
    return false
  }

  // Users must have a verified email to login if required by config
  if (isUnverifiedEmail(user, !!appConfig.EMAIL_VERIFICATION)) {
    return false
  }

  return true
}

// A user is privileged for email actions with the same requirements as login
// but also allowing users without email to bypass verification requirement to set an email
export function userIsPrivilegedForEmail(user: UserDetails | undefined, amr: amrFactor[]): boolean {
  if (!user) {
    return false
  }

  // If user has no factors, they cannot login
  if (!loginFactors(amr)) {
    return false
  }

  // If user has MFA enabled, they must have it completed
  if (user.mfaRequired && loginFactors(amr) < 2) {
    return false
  }

  // If user is required to have MFA, they must have it enabled
  if ((user.hasMfaGroup || appConfig.MFA_REQUIRED) && !user.mfaRequired) {
    return false
  }

  if (isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL)) {
    return false
  }

  if (isExpired(user)) {
    return false
  }

  // A user that doesn't have an email can still manage their email, even if email verification is required
  if (user.hasEmail && isUnverifiedEmail(user, !!appConfig.EMAIL_VERIFICATION)) {
    return false
  }

  return true
}

export function userIsPrivilegedForPasskeyCreate(user: UserDetails | undefined, amr: amrFactor[]): boolean {
  if (!user) {
    return false
  }

  // If user has no factors, they cannot login
  if (!loginFactors(amr)) {
    return false
  }

  // If user has MFA enabled, they must have it completed if they can
  if (userCanMfa(user) && user.mfaRequired && loginFactors(amr) < 2) {
    return false
  }

  if (isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL)) {
    return false
  }

  if (isExpired(user)) {
    return false
  }

  // Can still set up totp if they don't have an email, even if it is required
  if (user.hasEmail && isUnverifiedEmail(user, !!appConfig.EMAIL_VERIFICATION)) {
    return false
  }

  return true
}

export function userIsPrivilegedForTotpCreate(user: UserDetails | undefined, amr: amrFactor[]): boolean {
  return userIsPrivilegedForPasskeyCreate(user, amr)
}

export function userIsPrivilegedForTotpValidate(user: UserDetails | undefined, amr: amrFactor[]): boolean {
  if (!user) {
    return false
  }

  // Users can only validate a totp if they are already at least partially logged in with a first factor
  if (!loginFactors(amr)) {
    return false
  }

  if (isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL)) {
    return false
  }

  if (isExpired(user)) {
    return false
  }

  // Can still set up totp if they don't have an email, even if it is required
  if (user.hasEmail && isUnverifiedEmail(user, !!appConfig.EMAIL_VERIFICATION)) {
    return false
  }

  return true
}
