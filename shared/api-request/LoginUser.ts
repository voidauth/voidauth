import type { SchemaInfer } from '@shared/utils'
import zod from 'zod'

export const loginUserValidator = {
  input: zod.string().min(1).max(32).toLowerCase(),
  password: zod.string(),
  remember: zod.boolean().optional(),
} as const

export type LoginUser = SchemaInfer<typeof loginUserValidator>
