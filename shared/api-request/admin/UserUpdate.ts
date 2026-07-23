import { CUSTOM_CLAIM_CLAIM_REGEX, CUSTOM_CLAIM_SCOPE_REGEX, USERNAME_REGEX } from '@shared/constants'
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
    scope: zod.string().trim().regex(CUSTOM_CLAIM_SCOPE_REGEX),
    claim: zod.string().trim().regex(CUSTOM_CLAIM_CLAIM_REGEX),
    value: zod.string().trim().min(1),
  })),
} as const

export type UserUpdate = SchemaInfer<typeof userUpdateValidator>
