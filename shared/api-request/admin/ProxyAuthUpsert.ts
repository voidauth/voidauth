import { formatWildcardDomain, isValidWildcardDomain, type SchemaInfer } from '@shared/utils'
import zod from 'zod'

export const proxyAuthUpsertValidator = {
  id: zod.uuidv4().optional(),
  domain: zod.string().refine(val => isValidWildcardDomain(val)).transform(val => formatWildcardDomain(val)),
  mfaRequired: zod.union([zod.boolean(), zod.number()]),
  maxSessionLength: zod.int().min(5).max(525600).nullable(),
  groups: zod.array(zod.string()),
} as const

export type ProxyAuthUpsert = SchemaInfer<typeof proxyAuthUpsertValidator>
