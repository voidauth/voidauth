import { USERNAME_REGEX } from '@shared/constants'
import type { SchemaInfer } from '@shared/utils'
import { coerceEmailOrNull, nameValidation } from '@shared/validators'
import zod from 'zod'

export const userUpdateValidator = {
  id: zod.uuidv4(),
  username: zod.string().trim().regex(USERNAME_REGEX),
  name: nameValidation,
  email: coerceEmailOrNull,
  expiresAt: zod.iso.datetime().transform(val => val ? new Date(val) : null).nullable(),
  emailVerified: zod.boolean(),
  approved: zod.boolean(),
  mfaRequired: zod.boolean(),
  groups: zod.array(zod.object({
    id: zod.uuidv4(),
    name: zod.string().trim(),
  })),
  customClaims: zod.array(zod.object({
    scope: zod.string().trim().regex(new RegExp('^[A-Za-z0-9._:~-]+$')),
    claim: zod.string().trim().regex(new RegExp('^[a-zA-Z0-9_]+$')),
    value: zod.string(),
  })),
} as const

export type UserUpdate = SchemaInfer<typeof userUpdateValidator>
