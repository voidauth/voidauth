import type { Audit } from './Audit'

export type Invitation = Audit & {
  id: string
  challenge: string
  username?: string | null
  email?: string | null
  name?: string | null
  userExpiresAt?: Date | number | null
  emailVerified: boolean | number
  expiresAt: Date | number
}
