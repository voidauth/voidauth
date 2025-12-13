import type { Key } from '@shared/db/Key'
import { db } from './db'
import type { Consent } from '@shared/db/Consent'
import type { EmailVerification } from '@shared/db/EmailVerification'
import { TABLES } from '@shared/constants'
import type { Invitation } from '@shared/db/Invitation'
import type { OIDCPayload } from '@shared/db/OIDCPayload'
import type { PasskeyRegistration, PasskeyAuthentication } from '@shared/db/Passkey'
import type { PasswordReset } from '@shared/db/PasswordReset'
import type { ClientMetadata } from 'oidc-provider'
import appConfig from '../util/config'
import { getCookieKeys, getJWKs } from './key'
import { decryptString, encryptString } from './util'
import type { TOTP } from '@shared/db/TOTP'
import { logger } from '../util/logger'

export async function clearAllExpiredEntries() {
  await db().delete().table<Key>(TABLES.KEY).where('expiresAt', '<', new Date())
  await db().delete().table<Consent>(TABLES.CONSENT).where('expiresAt', '<', new Date())
  await db().delete().table<EmailVerification>(TABLES.EMAIL_VERIFICATION).where('expiresAt', '<', new Date())
  await db().delete().table<PasswordReset>(TABLES.PASSWORD_RESET).where('expiresAt', '<', new Date())
  await db().delete().table<Invitation>(TABLES.INVITATION).where('expiresAt', '<', new Date())
  await db().delete().table<OIDCPayload>(TABLES.OIDC_PAYLOADS).where('expiresAt', '<', new Date())
  await db().delete().table<PasskeyRegistration>(TABLES.PASSKEY_REGISTRATION).where('expiresAt', '<', new Date())
  await db().delete().table<PasskeyAuthentication>(TABLES.PASSKEY_AUTHENTICATION).where('expiresAt', '<', new Date())
  await db().delete().table<TOTP>(TABLES.TOTP).where('expiresAt', '<', new Date())
}

export type EncryptedTable = {
  id: string
  value?: string
}

export async function updateEncryptedTables(enableWarnings: boolean = false) {
  // update encrypted keys to use the latest storage encryption key
  // get keys that are locked, and those decryptable with the secondary key
  const { locked: lockedKeys, decryptable: decryptableKeys } = checkEncrypted(await db().select().table<Key>(TABLES.KEY))
  // for those decryptable with STORAGE_KEY_SECONDARY, re-encrypt with STORAGE_KEY
  for (const k of decryptableKeys) {
    const value = encryptString(k.value)
    await db().table<Key>(TABLES.KEY).update({
      value,
    }).where({ id: k.id })
  }
  const cookieKeys = await getCookieKeys()
  const jwks = await getJWKs()
  if (enableWarnings && lockedKeys.length > 0 && (cookieKeys.length === 0 || jwks.length === 0)) {
    logger.error(`WARNING!!!
      You have key(s) that could not be decrypted with the provided STORAGE_KEY or STORAGE_KEY_SECONDARY.
      This could be due to a mistake while rotating the storage key.
      New keys were generated to replace them, this invalidated all sessions and tokens.
      If you still have your original STORAGE_KEY, you can set it as the STORAGE_KEY_SECONDARY and get your keys back.`)
  }

  // Do the same for clients
  const { locked: lockedClients, decryptable: decryptableClients } = checkEncrypted(
    (await db().select().table<OIDCPayload>(TABLES.OIDC_PAYLOADS).where({ type: 'Client' })).map((p) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const payload: ClientMetadata = JSON.parse(p.payload)
      return {
        id: p.id,
        payload,
        value: payload.client_secret,
      }
    }))
  // for those decryptable with STORAGE_KEY_SECONDARY, re-encrypt with STORAGE_KEY
  for (const k of decryptableClients) {
    const client_secret = k.value != null ? encryptString(k.value) : k.value
    const payload = JSON.stringify({ ...k.payload, client_secret: client_secret })
    await db().table<OIDCPayload>(TABLES.OIDC_PAYLOADS).update({
      payload,
    }).where({ id: k.id, type: 'Client' })
  }
  if (enableWarnings && lockedClients.length > 0) {
    logger.error(`WARNING!!!
      You have OIDC Clients that could not be decrypted with the provided STORAGE_KEY or STORAGE_KEY_SECONDARY.
      This could be due to a mistake while rotating the storage key.
      If you still have your original STORAGE_KEY, you can set it as the STORAGE_KEY_SECONDARY to recover them.
      Non-decryptable Clients: ${lockedClients.map(c => c.id).join(', ')}`)
  }

  // Do the same for TOTPs
  const { locked: lockedTOTPs, decryptable: decryptableTOTPs } = checkEncrypted(await db().select().table<TOTP>(TABLES.TOTP))
  // for those decryptable with STORAGE_KEY_SECONDARY, re-encrypt with STORAGE_KEY
  for (const t of decryptableTOTPs) {
    const secret = encryptString(t.secret)
    await db().table<TOTP>(TABLES.TOTP).update({
      secret: secret,
    }).where({ id: t.id })
  }
  if (enableWarnings && lockedTOTPs.length > 0) {
    logger.error(`WARNING!!!
      You have MFA TOTP codes that could not be decrypted with the provided STORAGE_KEY or STORAGE_KEY_SECONDARY.
      This could be due to a mistake while rotating the storage key.
      If you still have your original STORAGE_KEY, you can set it as the STORAGE_KEY_SECONDARY to recover them.`)
  }

  if (decryptableKeys.length || decryptableClients.length || decryptableTOTPs.length) {
    console.log('A storage key rotation was detected, re-encrypted with new STORAGE_KEY.')
  }
}

function checkEncrypted<T extends EncryptedTable>(entries: T[]) {
  // find any that cannot be decrypted with STORAGE_KEY
  const stale = entries.filter(d => d.value && decryptString(d.value, [appConfig.STORAGE_KEY]) === null)

  // find those that CAN be decrypted with STORAGE_KEY_SECONDARY
  const decryptable = stale.reduce<T[]>((ks, k) => {
    if (k.value == null) {
      return ks
    }
    const value = decryptString(k.value, [appConfig.STORAGE_KEY_SECONDARY])
    if (value) {
      ks.push({ ...k, value })
    }
    return ks
  }, [])

  // find keys that could not be decrypted
  const locked = stale.filter(k => !decryptable.some(r => r.id === k.id))

  return {
    locked: locked,
    decryptable: decryptable,
  }
}
