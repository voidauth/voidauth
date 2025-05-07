import type { Audit } from './Audit.js'
import type { User } from './User.js'

export type PasswordReset = Pick<Audit, 'createdAt'> & {
  userId: User['id']
  challenge: string
  expiresAt: string
}
