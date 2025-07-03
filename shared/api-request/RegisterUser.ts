import type { Invitation } from '@shared/db/Invitation.js'
import type { User } from '../db/User.js'

export type RegisterUser = Pick<User, 'email' | 'username' | 'name'> & {
  password: string
} & {
  inviteId?: Invitation['id']
  challenge?: Invitation['challenge']
}
