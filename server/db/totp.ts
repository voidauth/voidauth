import * as OTPAuth from 'otpauth'
import { db } from './db'
import type { TOTP } from '@shared/db/TOTP'
import { TABLES, TTLs } from '@shared/constants'
import appConfig from '../util/config'
import { randomUUID } from 'crypto'
import { createExpiration, decryptString, encryptString } from './util'
import type { RegisterTotpResponse } from '@shared/api-response/RegisterTotpResponse'

function decryptTOTP(totp: TOTP | undefined): TOTP | null | undefined {
  if (!totp) {
    return totp
  }

  const decryptedSecret = decryptString(totp.secret, [appConfig.STORAGE_KEY, appConfig.STORAGE_KEY_SECONDARY])
  if (!decryptedSecret) {
    return null
  }

  return {
    ...totp,
    secret: decryptedSecret,
  }
}

function decryptTOTPs(totps: TOTP[]): TOTP[] {
  return totps.reduce<TOTP[]>((arr, t) => {
    const d = decryptTOTP(t)
    if (d) {
      arr.push(d)
    }
    return arr
  }, [])
}

async function getUserTOTPs(userId: string, includeExpiring = false) {
  return decryptTOTPs(await db().table<TOTP>(TABLES.TOTP)
    .where({ userId })
    .andWhere((w) => {
      w.where({ expiresAt: null })
      if (includeExpiring) {
        w.orWhere('expiresAt', '>', new Date())
      }
    }))
}

export async function createTOTP(userId: string, label: string): Promise<RegisterTotpResponse> {
  const otp = new OTPAuth.TOTP({
    issuer: appConfig.APP_TITLE,
    label,
  })

  const secret = otp.secret.base32
  const uri = otp.toString()

  const totp: TOTP = {
    id: randomUUID(),
    userId,
    secret: encryptString(secret),
    expiresAt: createExpiration(TTLs.TOTP_VERIFICATION),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  await db().table<TOTP>(TABLES.TOTP).insert(totp)

  return { uri, secret }
}

export async function hasTOTP(userId: string) {
  return !!(await getUserTOTPs(userId)).length
}

export async function validateTOTP(userId: string, token: string) {
  const totps = await getUserTOTPs(userId, true)

  for (const totp of totps) {
    const delta = (new OTPAuth.TOTP({
      secret: totp.secret,
    })).validate({ token, window: 1 })
    if (delta != null) {
      if (totp.expiresAt != null) {
        await db().table<TOTP>(TABLES.TOTP).update({ expiresAt: null, updatedAt: new Date() }).where({ id: totp.id })
      }
      return true
    }
  }

  return false
}
