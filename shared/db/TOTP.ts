import type { DBColumnTypesCheck } from '@shared/db'
import type { Audit } from './Audit'

export type TOTP = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  userId: string
  secret: string
  expiresAt: Date | number | null
}

const _typeCheck: DBColumnTypesCheck<TOTP> = true
