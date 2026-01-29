// No imports from project

import zod from 'zod'

export function booleanString(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  return zod.stringbool().safeParse(value).data ?? null
}
