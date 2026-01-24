import type { SchemaInfer } from '@shared/utils'
import zod from 'zod'

export const groupUpsertValidator = {
  id: zod.uuidv4().optional(),
  name: zod.string().regex(new RegExp('^[A-Za-z0-9_-]+$')),
  mfaRequired: zod.union([zod.boolean(), zod.number()]),
  users: zod.array(zod.object({
    id: zod.uuidv4(),
    username: zod.string(),
  })),
} as const

export type GroupUpsert = SchemaInfer<typeof groupUpsertValidator>
