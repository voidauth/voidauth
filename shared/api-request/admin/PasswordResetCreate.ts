import type { User } from "@shared/db/User"

export type PasswordResetCreate = {
  userId: User["id"]
}
