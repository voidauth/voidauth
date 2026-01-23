import { USERNAME_REGEX } from '@shared/constants.js'
import zod from 'zod'
import { coerceEmailOrNull, nameValidation } from '@shared/validators.js'
import type { SchemaInfer } from '@shared/utils.js'

export const registerUserValidator = {
  username: zod.string().regex(USERNAME_REGEX),
  name: nameValidation,
  email: coerceEmailOrNull.optional(),
  inviteId: zod.string().optional(),
  challenge: zod.string().optional(),
  password: zod.string(),
} as const

export type RegisterUser = SchemaInfer<typeof registerUserValidator>
