import type { DBColumnTypesCheck } from '@shared/db'
import type { Audit } from './Audit'
import type { User } from './User'

export type CustomClaim = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  claim: string
}

const _typeCheckCustomClaim: DBColumnTypesCheck<CustomClaim> = true

export type UserCustomClaim = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  userId: User['id']
  claimId: CustomClaim['id']
  value: string
}

const _typeCheckUserCustomClaim: DBColumnTypesCheck<UserCustomClaim> = true
