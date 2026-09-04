import type { Paginated } from '../Paginated'
import type { PasswordResetUser } from './PasswordResetUser'

export type PasswordResetsResponse = Paginated & {
  passwordResets: PasswordResetUser[]
}
