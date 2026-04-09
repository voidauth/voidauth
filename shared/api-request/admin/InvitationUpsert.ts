import { USERNAME_REGEX } from '@shared/constants'
import type { SchemaInfer } from '@shared/utils'
import { coerceEmailOrNull, nameValidation } from '@shared/validators'
import zod from 'zod'

export const invitationUpsertValidator = {
  id: zod.uuidv4().optional(),
  username: zod.string().trim().regex(USERNAME_REGEX).nullish(),
  name: nameValidation,
  email: coerceEmailOrNull.optional(),
  userExpiresAt: zod.iso.datetime().transform(val => val ? new Date(val) : null).nullable(),
  emailVerified: zod.boolean(),
  groups: zod.array(zod.string().trim()),
} as const

export type InvitationUpsert = SchemaInfer<typeof invitationUpsertValidator>
