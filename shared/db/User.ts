import type { DBColumnTypesCheck } from '@shared/db'
import type { Audit } from './Audit'

export type User = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  username: string
  passwordHash?: string | null
  email?: string | null
  name?: string | null
  emailVerified: boolean | number
  approved: boolean | number
  mfaRequired: boolean | number
  expiresAt?: number | Date | null
  /** Set to 'ldap' when the user is managed by LDAP sync. */
  ldapSource?: string | null
  /** The user's full LDAP DN (used for bind authentication and group-membership resolution). */
  ldapExternalId?: string | null
}

const _typeCheck: DBColumnTypesCheck<User> = true
