import type { User } from "@shared/db/User"

export type UpdateEmail = Pick<User, "email">
