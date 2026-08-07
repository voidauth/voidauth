import type { Invitation } from '@shared/db/Invitation'
import type { OptionalOrUndefined } from '@shared/utils'

// Still only sent after knowing the invitation challenge, but only basic user info
export type InvitationBasic = Pick<Invitation, 'id' | 'challenge' | 'username' | 'email' | 'name'>
  & OptionalOrUndefined<Pick<Invitation, 'expiresAt' | 'userExpiresAt'>>
