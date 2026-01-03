import { TTLs, TABLES } from '@shared/constants'
import type { PasswordReset } from '@shared/db/PasswordReset'
import { randomUUID } from 'crypto'
import { generate } from 'generate-password'
import { db } from './db'
import { createExpiration } from './util'

export async function createPasswordReset(userId: string) {
  const passwordReset: PasswordReset = {
    id: randomUUID(),
    userId: userId,
    challenge: generate({
      length: 32,
      numbers: true,
    }),
    createdAt: new Date(),
    expiresAt: createExpiration(TTLs.PASSWORD_RESET),
  }
  await db().table<PasswordReset>(TABLES.PASSWORD_RESET).insert(passwordReset)

  return passwordReset
}
