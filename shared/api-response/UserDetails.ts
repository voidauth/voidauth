import type { OnlyKeys, RemoveKeys } from '@shared/utils'
import type { Group } from '../db/Group.js'
import type { User } from '../db/User.js'
import type { amrFactor } from '@shared/user.js'

export type UserWithoutPassword = RemoveKeys<User, 'passwordHash'> & {
  hasPassword: boolean
  hasEmail: boolean
}

export type UserWithAdminIndicator = UserWithoutPassword & {
  isAdmin: boolean
}

export type UserDetails = UserWithAdminIndicator & {
  groups: {
    id: Group['id']
    name: Group['name']
    customClaims: {
      claim: string
      value: string
    }[]
  }[]
  customClaims: {
    claim: string
    value: string
  }[]
  hasTotp: boolean
  hasPasskeys: boolean
  hasVerifyPasskeys: boolean
  hasMfaGroup: boolean
}

type UserSessionInfo = {
  amr: amrFactor[]
  canLogin: boolean
  isPrivilegedForTotpCreate: boolean // has all amr to create totp
  isPrivilegedForPasskeyCreate: boolean // has all amr to create passkeys
  isPrivilegedForEmail: boolean // has all amr to make email changes
}

export type CurrentUserPrivateDetails = UserDetails & UserSessionInfo

// UserDetails and info about current session
// This info may be visible to users who are not fully logged in
// so should not contain anything that could be used to elevate privileges or identify the user
export type CurrentUserDetails = OnlyKeys<
  UserDetails,
  'id' | 'isAdmin' | 'mfaRequired' | 'hasTotp'
  | 'hasPasskeys' | 'hasVerifyPasskeys' | 'hasEmail' | 'emailVerified' | 'expiresAt' | 'approved'>
  & UserSessionInfo
