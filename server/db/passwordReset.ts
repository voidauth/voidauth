import { TTLs, REDIRECT_PATHS } from '@shared/constants'
import type { PasswordReset } from '@shared/db/PasswordReset'
import { randomBytes, randomUUID } from 'crypto'
import { db } from './db'
import { createExpiration } from './util'
import appConfig from '../util/config'
import { TABLES } from '@shared/db'

export async function createPasswordReset(userId: string, customTTL: number = 0) {
  if (customTTL < 0) {
    throw new Error('Invalid TTL for Password Reset.')
  }
  const passwordReset: PasswordReset = {
    id: randomUUID(),
    userId: userId,
    challenge: randomBytes(24).toString('base64url'),
    createdAt: new Date(),
    expiresAt: customTTL ? createExpiration(customTTL) : createExpiration(TTLs.PASSWORD_RESET),
  }
  await db().table<PasswordReset>(TABLES.PASSWORD_RESET).insert(passwordReset)

  return passwordReset
}

export function getPasswordResetURL(passwordReset: PasswordReset) {
  const query = `id=${passwordReset.userId}&challenge=${passwordReset.challenge}`
  return `${appConfig.APP_URL}/${REDIRECT_PATHS.RESET_PASSWORD}?${query}`
}
