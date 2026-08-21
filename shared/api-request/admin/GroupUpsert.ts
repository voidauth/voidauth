import { CUSTOM_CLAIM_REGEX } from '@shared/constants'
import type { SchemaInfer } from '@shared/utils'
import zod from 'zod'

export const groupUpsertValidator = {
  id: zod.uuidv4().optional(),
  name: zod.string().trim().regex(new RegExp('^[A-Za-z0-9_-]+$')),
  mfaRequired: zod.boolean(),
  autoAssign: zod.boolean(),
  users: zod.array(zod.object({
    id: zod.uuidv4(),
    username: zod.string().trim(),
  })),
  customClaims: zod.array(zod.object({
    claim: zod.string().trim().regex(CUSTOM_CLAIM_REGEX),
    value: zod.string().trim().min(1),
  })),
} as const

export type GroupUpsert = SchemaInfer<typeof groupUpsertValidator>
