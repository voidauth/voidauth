import type { RemoveKeys } from '@shared/utils.js'
import type { Group } from '../db/Group.js'
import type { User } from '../db/User.js'

export type UserWithoutPassword = RemoveKeys<User, 'passwordHash'> & {
  hasPassword: boolean
}

export type UserWithAdminIndicator = UserWithoutPassword & {
  isAdmin: boolean
}

export type UserDetails = UserWithoutPassword & {
  groups: Group['name'][]
  mfaEnabled: boolean
  hasPasskeys: boolean
}

// UserDetails and info about current session
export type CurrentUserDetails = UserDetails & {
  amr?: string[]
}
