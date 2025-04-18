import type { User } from "@shared/db/User";

export type UpdateProfile = Pick<User, "username" | "name">