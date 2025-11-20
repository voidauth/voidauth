import type { UserDetails } from '@shared/api-response/UserDetails'

type UserUpdateFields = 'id'
  | 'username'
  | 'name'
  | 'email'
  | 'emailVerified'
  | 'approved'
  | 'groups'
  | 'mfaRequired'

export type UserUpdate = Pick<UserDetails, UserUpdateFields>
