import * as OTPAuth from 'otpauth'
import { db } from './db'
import type { TOTP } from '@shared/db/TOTP'
import { MINUTE, TTLs } from '@shared/constants'
import appConfig from '../util/config'
import { randomUUID } from 'crypto'
import { createExpiration, decryptString, encryptString } from './util'
import type { RegisterTotpResponse } from '@shared/api-response/RegisterTotpResponse'
import { TABLES } from '@shared/db'
import type { TOTPFailedAttempt } from '@shared/db/TOTPFailedAttempt'

const TOTP_MAX_FAILED_ATTEMPTS = 10
const TOTP_FAILED_ATTEMPT_WINDOW = 10 * MINUTE
const TOTP_LOCKOUT = 10 * MINUTE

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

export async function recordTotpFailure(userId: string): Promise<void> {
  await db().table<TOTPFailedAttempt>(TABLES.TOTP_FAILED_ATTEMPT).insert({
    id: randomUUID(),
    userId,
    expiresAt: createExpiration(TTLs.TOTP_FAILED_ATTEMPT),
    createdAt: new Date(),
  })
}

export async function getTotpLockoutUntil(userId: string): Promise<Date | null> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - ((TOTP_LOCKOUT + TOTP_FAILED_ATTEMPT_WINDOW) * 1000))
  const attempts = await db().table<TOTPFailedAttempt>(TABLES.TOTP_FAILED_ATTEMPT)
    .where({ userId })
    .andWhere('createdAt', '>', windowStart)
    .andWhere('expiresAt', '>', now)
    .orderBy('createdAt', 'desc') // newest first

  // If there are fewer than the max failed attempts, no lockout is possible
  if (attempts.length < TOTP_MAX_FAILED_ATTEMPTS) {
    return null
  }

  // Check if there are any lockouts by checking every pair of attempts in the interval TOTP_MAX_FAILED_ATTEMPTS
  // to see if they are within the lockout window.
  // Because we are starting with the most recent failed attempts,
  // the first pair we find that is within the lockout window will be the one that determines the lockout expiration.
  for (let index = 0; index <= attempts.length - TOTP_MAX_FAILED_ATTEMPTS; index++) {
    const newerAttempt = attempts[index] // 0 1 2
    const olderAttempt = attempts[index + TOTP_MAX_FAILED_ATTEMPTS - 1] // 9 10 11
    if (!newerAttempt || !olderAttempt) {
      continue
    }

    const newerCreatedAtTime = (new Date(newerAttempt.createdAt)).getTime()
    const olderCreatedAtTime = (new Date(olderAttempt.createdAt)).getTime()
    // if the older and newer attempts are within the lockout window, return the lockout expiration
    if ((newerCreatedAtTime - olderCreatedAtTime) <= (TOTP_FAILED_ATTEMPT_WINDOW * 1000)) {
      const lockedUntil = new Date(newerCreatedAtTime + (TOTP_LOCKOUT * 1000))
      return lockedUntil > now ? lockedUntil : null
    }
  }

  return null
}
