import { type SchemaInfer } from '@shared/utils'
import { formatWildcardDomain, isValidWildcardDomain } from '@shared/url'
import zod from 'zod'

export const proxyAuthUpsertValidator = {
  id: zod.uuidv4().optional(),
  domain: zod.string().trim().refine(val => isValidWildcardDomain(val)).transform(val => formatWildcardDomain(val)),
  mfaRequired: zod.boolean(),
  maxSessionLength: zod.int().min(5).max(525600).nullable(),
  groups: zod.array(zod.string().trim()),
} as const

export type ProxyAuthUpsert = SchemaInfer<typeof proxyAuthUpsertValidator>
