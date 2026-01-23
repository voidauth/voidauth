import type { SchemaInfer } from '@shared/utils'
import { coerceEmailOrNull } from '@shared/validators'

export const updateEmailValidator = {
  email: coerceEmailOrNull,
} as const

export type UpdateEmail = SchemaInfer<typeof updateEmailValidator>
