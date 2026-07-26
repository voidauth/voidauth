import { CUSTOM_CLAIM_CLAIM_REGEX } from '@shared/constants'
import type { SchemaInfer } from '@shared/utils'
import zod from 'zod'

export const customClaimUpsertValidator = {
  id: zod.uuidv4().optional(),
  claim: zod.string().trim().regex(CUSTOM_CLAIM_CLAIM_REGEX),
} as const

export type CustomClaimUpsert = SchemaInfer<typeof customClaimUpsertValidator>
