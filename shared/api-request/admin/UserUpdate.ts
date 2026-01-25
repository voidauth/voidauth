import { USERNAME_REGEX } from '@shared/constants'
import type { SchemaInfer } from '@shared/utils'
import { coerceEmailOrNull, nameValidation } from '@shared/validators'
import zod from 'zod'

export const userUpdateValidator = {
  id: zod.uuidv4(),
  username: zod.string().regex(USERNAME_REGEX),
  name: nameValidation,
  email: coerceEmailOrNull.optional(),
  emailVerified: zod.union([zod.boolean(), zod.number()]),
  approved: zod.union([zod.boolean(), zod.number()]),
  mfaRequired: zod.union([zod.boolean(), zod.number()]),
  groups: zod.array(zod.object({
    name: zod.string(),
    id: zod.uuidv4(),
  })),
} as const

export type UserUpdate = SchemaInfer<typeof userUpdateValidator>
