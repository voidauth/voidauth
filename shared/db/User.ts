import type { Audit } from './Audit'

export type User = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  username: string
  passwordHash: string
  email?: string | null
  name?: string | null
  emailVerified?: boolean
  approved?: boolean
}
