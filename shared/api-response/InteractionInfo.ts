import type { Redirect } from './Redirect'
import type { UserDetails } from './UserDetails'

export type InteractionInfo = {
  redirect: Redirect | null
  user: Partial<Pick<UserDetails, 'hasTotp' | 'hasPasskeys'>>
}
