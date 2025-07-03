import type { Audit } from './Audit'
import type { User } from './User'

export type Consent = Pick<Audit, 'createdAt'> & {
  userId: User['id']
  redirectUri: string
  scope: string
  expiresAt: Date
}
