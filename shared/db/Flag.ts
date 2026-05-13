import type { DBColumnTypesCheck } from '@shared/db'

export type Flag = {
  name: string
  value: string | null
  createdAt: Date | number
}

const _typeCheck: DBColumnTypesCheck<Flag> = true
