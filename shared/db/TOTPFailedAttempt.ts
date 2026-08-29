import type { DBColumnTypesCheck } from '@shared/db'
import type { Audit } from './Audit'

export type TOTPFailedAttempt = Pick<Audit, 'createdAt'> & {
  id: string
  userId: string
  expiresAt: Date | number
}

const _typeCheck: DBColumnTypesCheck<TOTPFailedAttempt> = true
