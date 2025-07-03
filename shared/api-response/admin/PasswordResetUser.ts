import type { PasswordReset } from '@shared/db/PasswordReset'
import type { User } from '@shared/db/User'

export type PasswordResetUser = PasswordReset & Pick<User, 'username' | 'email'>
