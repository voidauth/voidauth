import type { SchemaInfer } from '@shared/utils'
import zod from 'zod'

export const updatePasswordValidator = {
  oldPassword: zod.string().nullish(),
  newPassword: zod.string(),
} as const

export type UpdatePassword = SchemaInfer<typeof updatePasswordValidator>
