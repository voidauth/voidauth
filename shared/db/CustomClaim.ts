import type { DBColumnTypesCheck } from '@shared/db'
import type { Audit } from './Audit'
import type { Invitation } from './Invitation'
import type { User } from './User'

export type CustomClaim = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  scope: string
  claim?: string | null
}

const _typeCheck: DBColumnTypesCheck<CustomClaim> = true

export type UserCustomClaim = Pick<Audit, 'createdAt'> & {
  id: string
  userId: User['id']
  claimId: CustomClaim['id']
  value: string
}

export type InvitationCustomClaim = Pick<Audit, 'createdAt'> & {
  id: string
  invitationId: Invitation['id']
  claimId: CustomClaim['id']
  value: string
}
