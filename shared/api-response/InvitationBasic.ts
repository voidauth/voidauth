import type { Invitation } from '@shared/db/Invitation'
import type { OnlyKeys } from '@shared/utils'

// Still only sent after knowing the invitation challenge, but only basic user info
export type InvitationBasic = OnlyKeys<Invitation, 'id' | 'challenge' | 'username' | 'email' | 'name'>
