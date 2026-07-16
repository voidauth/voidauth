import type { DBColumnTypesCheck } from '@shared/db'
import type { Audit } from './Audit'
import type { User } from './User'

export type CustomScope = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  scope: string
}

const _typeCheckCustomScope: DBColumnTypesCheck<CustomScope> = true

export type CustomClaim = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  scopeId: CustomScope['id']
  claim: string
  includedInLdap: boolean
}

const _typeCheckCustomClaim: DBColumnTypesCheck<CustomClaim> = true

export type UserCustomClaim = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  userId: User['id']
  claimId: CustomClaim['id']
  value: string
}
