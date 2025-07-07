import type { InvitationDetails } from '@shared/api-response/InvitationDetails'

export type InvitationUpsert = Partial<Pick<InvitationDetails, 'id'>>
  & Pick<InvitationDetails, 'username' | 'email' | 'name' | 'groups' | 'emailVerified'>
