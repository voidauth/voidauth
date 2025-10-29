import * as OTPAuth from 'otpauth'
import { db } from './db'
import type { TOTP } from '@shared/db/TOTP'
import { TABLES } from '@shared/constants'

export async function hasTOTP(userId: string) {
  return !!(await db().table<TOTP>(TABLES.TOTP).where({ userId, verified: true }).andWhereNot('expiresAt', '<', new Date()).first())
}

export async function verifyTOTP(id: string, token: string) {
  const totp = await db().table<TOTP>(TABLES.TOTP).where({ id }).andWhereNot('expiresAt', '<', new Date()).first()
  if (totp) {
    const delta = (new OTPAuth.TOTP({
      secret: totp.secret,
    })).validate({ token, window: 1 })
    if (delta != null) {
      await db().table<TOTP>(TABLES.TOTP).update({ verified: true, expiresAt: null }).where({ id: totp.id })
      return true
    }
  }

  return false
}

export async function validateTOTP(userId: string, token: string) {
  const totps = await db().table<TOTP>(TABLES.TOTP).where({ userId, verified: true })
    .andWhereNot('expiresAt', '<', new Date())
  for (const totp of totps) {
    const delta = (new OTPAuth.TOTP({
      secret: totp.secret,
    })).validate({ token, window: 1 })
    if (delta != null) {
      return true
    }
  }

  return false
}
