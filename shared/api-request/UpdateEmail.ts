import type { User } from '@shared/db/User'

export type UpdateEmail = Required<Pick<User, 'email'>>
