import type { Audit } from './Audit'
import type { Invitation } from './Invitation'
import type { User } from './User'

export type UserCustomClaim = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  userId: User['id']
  claim: string
  value: string
}

export type InvitationCustomClaim = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  invitationId: Invitation['id']
  claim: string
  value: string
}
