import type { Audit } from "./Audit.js"
import type { User } from "./User.js"

export type EmailVerification = Pick<Audit, "createdAt"> & {
  id: string
  userId: User["id"]
  email: string
  challenge: string
  expiresAt: Date
}
