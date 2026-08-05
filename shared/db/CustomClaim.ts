import type { DBColumnTypesCheck } from '@shared/db'
import type { Audit } from './Audit'
import type { User } from './User'
import type { Group } from './Group'
import type { Invitation } from './Invitation'

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

export type GroupCustomClaim = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  groupId: Group['id']
  claimId: CustomClaim['id']
  value: string
}

const _typeCheckGroupCustomClaim: DBColumnTypesCheck<GroupCustomClaim> = true

export type InvitationCustomClaim = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  invitationId: Invitation['id']
  claimId: CustomClaim['id']
  value: string
}

const _typeCheckInvitationCustomClaim: DBColumnTypesCheck<InvitationCustomClaim> = true
