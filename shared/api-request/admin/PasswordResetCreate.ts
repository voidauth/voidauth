import type { SchemaInfer } from '@shared/utils'
import zod from 'zod'

export const passwordResetCreateValidator = {
  userId: zod.uuidv4(),
} as const

export type PasswordResetCreate = SchemaInfer<typeof passwordResetCreateValidator>
