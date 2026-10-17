import type { SchemaInfer } from '@shared/utils'
import zod from 'zod'

export const updatePasskeyPromptValidator = {
  skipPasskeyPrompt: zod.boolean(),
} as const

export type UpdatePasskeyPrompt = SchemaInfer<typeof updatePasskeyPromptValidator>
