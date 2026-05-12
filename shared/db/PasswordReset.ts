import type { DBColumnTypesCheck } from '@shared/db.js'
import type { Audit } from './Audit'
import type { User } from './User'

export type PasswordReset = Pick<Audit, 'createdAt'> & {
  id: string
  userId: User['id']
  challenge: string
  expiresAt: Date | number
}

const _typeCheck: DBColumnTypesCheck<PasswordReset> = true
