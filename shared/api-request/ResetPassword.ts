import type { SchemaInfer } from '@shared/utils'
import zod from 'zod'
import { userChallengeValidator } from './UserChallenge'

export const resetPasswordValidator = {
  ...userChallengeValidator,
  newPassword: zod.string(),
} as const

export type ResetPassword = SchemaInfer<typeof resetPasswordValidator>
