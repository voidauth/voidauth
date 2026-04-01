import type { UserDetails } from '@shared/api-response/UserDetails'
import { isUnapproved, isUnverifiedEmail, loginFactors } from '@shared/user'
import { userRequiresMfa } from '../db/user'
import appConfig from './config'

function userMfaComplete(user: UserDetails, amr: string[]) {
  const factors = loginFactors(amr)

  if (factors === 0) {
    return false
  }

  if (userRequiresMfa(user) && factors < 2) {
    return false
  }

  return true
}

function usingMfaIfExists(user: UserDetails, amr: string[]) {
  return !user.hasTotp || loginFactors(amr) > 1
}

/**
 * Determines if a user can login.
 * Checks that session has required factors, user is approved, and email is verified (if required)
 */
export function userCanLogin(user: UserDetails | undefined, amr: string[]): user is UserDetails {
  if (!user) {
    return false
  }

  if (!userMfaComplete(user, amr)) {
    return false
  }

  if (isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL)) {
    return false
  }

  if (isUnverifiedEmail(user, !!appConfig.EMAIL_VERIFICATION)) {
    return false
  }

  return true
}

// A privileged user can perform all account actions
export function userIsPrivileged(user: UserDetails | undefined, amr: string[]): boolean {
  if (!user) {
    return false
  }

  if (!userMfaComplete(user, amr)) {
    return false
  }

  if (isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL)) {
    return false
  }

  if (isUnverifiedEmail(user, !!appConfig.EMAIL_VERIFICATION)) {
    return false
  }

  if (!usingMfaIfExists(user, amr)) {
    return false
  }

  return true
}

// A user is privileged for email actions with the same requirements as privileged
// but also allowing users without email to bypass verification requirement to set an email
export function userIsPrivilegedForEmail(user: UserDetails | undefined, amr: string[]): boolean {
  if (!user) {
    return false
  }

  if (!userMfaComplete(user, amr)) {
    return false
  }

  if (isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL)) {
    return false
  }

  if (user.email && isUnverifiedEmail(user, !!appConfig.EMAIL_VERIFICATION)) {
    return false
  }

  if (!usingMfaIfExists(user, amr)) {
    return false
  }

  return true
}

export function userIsPrivilegedForTotpCreate(user: UserDetails | undefined, amr: string[]): boolean {
  if (!user) {
    return false
  }

  if (isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL)) {
    return false
  }

  // Can still set up totp if they don't have an email, even if it is required
  if (user.email && isUnverifiedEmail(user, !!appConfig.EMAIL_VERIFICATION)) {
    return false
  }

  // If they already have totp, require strict privilege to manage it. Otherwise allow set up without being privileged
  if ((!userMfaComplete(user, amr) || !usingMfaIfExists(user, amr)) && (user.hasTotp || !loginFactors(amr))) {
    return false
  }

  return true
}

export function userIsPrivilegedForTotpValidate(user: UserDetails | undefined, amr: string[]): boolean {
  if (!user) {
    return false
  }

  if (isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL)) {
    return false
  }

  // Can still validate up totp if they don't have an email, even if it is required
  if (user.email && isUnverifiedEmail(user, !!appConfig.EMAIL_VERIFICATION)) {
    return false
  }

  // Users can only validate a totp if they are already partially logged in with a first factor
  if (!loginFactors(amr)) {
    return false
  }

  return true
}
