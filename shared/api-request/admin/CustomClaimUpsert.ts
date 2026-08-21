import { CUSTOM_CLAIM_REGEX } from '@shared/constants'
import type { SchemaInfer } from '@shared/utils'
import zod from 'zod'

export const customClaimUpsertValidator = {
  id: zod.uuidv4().optional(),
  claim: zod.string().trim().regex(CUSTOM_CLAIM_REGEX),
  users: zod.array(zod.object({
    id: zod.uuidv4(),
    value: zod.string().trim().min(1),
  })),
  groups: zod.array(zod.object({
    id: zod.uuidv4(),
    value: zod.string().trim().min(1),
  })),
  invitations: zod.array(zod.object({
    id: zod.uuidv4(),
    value: zod.string().trim().min(1),
  })),
} as const

export type CustomClaimUpsert = SchemaInfer<typeof customClaimUpsertValidator>
