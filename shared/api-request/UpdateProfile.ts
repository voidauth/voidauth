import type { SchemaInfer } from '@shared/utils'
import { nameValidation } from '@shared/validators'

export const updateProfileValidator = {
  name: nameValidation,
} as const

export type UpdateProfile = SchemaInfer<typeof updateProfileValidator>
