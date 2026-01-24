import { USERNAME_REGEX } from '@shared/constants'
import type { SchemaInfer } from '@shared/utils'
import { coerceEmailOrNull, nameValidation } from '@shared/validators'
import zod from 'zod'

export const invitationUpsertValidator = {
  id: zod.uuidv4().optional(),
  username: zod.string().regex(USERNAME_REGEX).nullish(),
  name: nameValidation,
  email: coerceEmailOrNull.optional(),
  emailVerified: zod.union([zod.boolean(), zod.number()]),
  groups: zod.array(zod.string()),
} as const

export type InvitationUpsert = SchemaInfer<typeof invitationUpsertValidator>
