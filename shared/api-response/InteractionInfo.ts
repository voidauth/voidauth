import type { Redirect } from './Redirect'
import type { CurrentUserDetails } from './UserDetails'

export type InteractionInfo = {
  successRedirect: Redirect | null
  user?: CurrentUserDetails
}
