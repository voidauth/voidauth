import type { Audit } from './Audit'

export type TOTP = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  userId: string
  secret: string
  verified: boolean | number
  expiresAt: Date | number | null
}
