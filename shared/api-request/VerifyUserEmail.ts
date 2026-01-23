import type { SchemaInfer } from '@shared/utils'
import zod from 'zod'

export const verifyUserEmailValidator = {
  userId: zod.uuidv4(),
  challenge: zod.string(),
} as const

export type VerifyUserEmail = SchemaInfer<typeof verifyUserEmailValidator>
