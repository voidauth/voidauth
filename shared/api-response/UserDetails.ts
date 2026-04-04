import type { RemoveKeys } from '@shared/utils.js'
import type { Group } from '../db/Group.js'
import type { User } from '../db/User.js'

export type UserWithoutPassword = RemoveKeys<User, 'passwordHash'> & {
  hasPassword: boolean
  hasEmail: boolean
}

export type UserWithAdminIndicator = UserWithoutPassword & {
  isAdmin: boolean
}

export type UserDetails = UserWithAdminIndicator & {
  groups: Pick<Group, 'id' | 'name'>[]
  hasTotp: boolean
  hasPasskeys: boolean
  hasMfaGroup: boolean
}

type UserSessionInfo = {
  amr: string[]
  canLogin: boolean
  isPrivilegedForTotpCreate: boolean // has all amr to make totp changes
  isPrivilegedForEmail: boolean // has all amr to make email changes
  isPrivileged: boolean // has all amr to make account changes
}

export type CurrentUserPrivateDetails = UserDetails & UserSessionInfo

// UserDetails and info about current session
// This info may be visible to users who are not fully logged in
// so should not contain anything that could be used to elevate privileges or identify the user
export type CurrentUserDetails = Pick<
  UserDetails,
  'id' | 'isAdmin' | 'hasTotp' | 'hasPasskeys' | 'hasEmail' | 'emailVerified'>
  & UserSessionInfo & {
    // Guard, these fields should not be sent to an unprivileged frontend
    username?: undefined
    email?: undefined
  }
