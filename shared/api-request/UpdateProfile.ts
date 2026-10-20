import type { SchemaInfer } from '@shared/utils'
import { nameValidation, pictureValidation } from '@shared/validators'

export const updateProfileValidator = {
  name: nameValidation,
  picture: pictureValidation,
} as const

export type UpdateProfile = SchemaInfer<typeof updateProfileValidator>
