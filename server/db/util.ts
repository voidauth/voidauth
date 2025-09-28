/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { Key } from '@shared/db/Key'
import { db } from './db'
import type { Consent } from '@shared/db/Consent'
import type { EmailVerification } from '@shared/db/EmailVerification'
import type { PasswordReset } from '@shared/db/PasswordReset'
import type { Invitation } from '@shared/db/Invitation'
import type { OIDCPayload } from '@shared/db/OIDCPayload'
import appConfig from '../util/config'
import { decryptString, encryptString, getCookieKeys, getJWKs } from './key'
import type { ClientMetadata } from 'oidc-provider'
import type { PasskeyAuthentication, PasskeyRegistration } from '@shared/db/Passkey'

/**
 *
 * @param inserted DB object being inserted
 * @returns A list of keys on inserted that does not included commonly excluded keys
 */
export function mergeKeys<T extends object>(inserted: T): (keyof T)[] {
  const exludedKeys = ['createdAt', 'createdBy']
  return Object.keys(inserted).filter(k => !exludedKeys.includes(k)) as (keyof T)[]
}

export function createExpiration(ttl: number) {
  return new Date(Date.now() + (ttl * 1000))
}

function timeToExpiration(expires: Date | number) {
  return ((new Date(expires)).getTime() - Date.now())
}

export function pastHalfExpired(ttl: number, expires: Date | number) {
  return timeToExpiration(expires) < (ttl * 1000 / 2)
}

export async function clearAllExpiredEntries() {
  await db().delete().table<Key>('key').where('expiresAt', '<', new Date())
  await db().delete().table<Consent>('consent').where('expiresAt', '<', new Date())
  await db().delete().table<EmailVerification>('email_verification').where('expiresAt', '<', new Date())
  await db().delete().table<PasswordReset>('password_reset').where('expiresAt', '<', new Date())
  await db().delete().table<Invitation>('invitation').where('expiresAt', '<', new Date())
  await db().delete().table<OIDCPayload>('oidc_payloads').where('expiresAt', '<', new Date())
  await db().delete().table<PasskeyRegistration>('passkey_registration').where('expiresAt', '<', new Date())
  await db().delete().table<PasskeyAuthentication>('passkey_authentication').where('expiresAt', '<', new Date())
}

export type EncryptedTable = {
  id: string
  value?: string
}

export async function updateEncryptedTables(enableWarnings: boolean = false) {
  // update encrypted keys to use the latest storage encryption key
  // get keys that are locked, and those decryptable with the secondary key
  const { locked: lockedKeys, decryptable: decryptableKeys } = checkEncrypted(await db().select().table<Key>('key'))
  // for those decryptable with STORAGE_KEY_SECONDARY, re-encrypt with STORAGE_KEY
  for (const k of decryptableKeys) {
    const value = encryptString(k.value)
    await db().table<Key>('key').update({
      value,
    }).where({ id: k.id })
  }
  const cookieKeys = await getCookieKeys()
  const jwks = await getJWKs()
  if (enableWarnings && lockedKeys.length > 0 && (cookieKeys.length === 0 || jwks.length === 0)) {
    console.error(`WARNING!!!
      You have key(s) that could not be decrypted with the provided STORAGE_KEY or STORAGE_KEY_SECONDARY.
      This could be due to a mistake while rotating the storage key.
      New keys were generated to replace them, this invalidated all sessions and tokens.
      If you stil have your original STORAGE_KEY, you can set it as the STORAGE_KEY_SECONDARY and get your keys back.`)
  }

  // Do the same for clients
  const { locked: lockedClients, decryptable: decryptableClients } = checkEncrypted(
    (await db().select().table<OIDCPayload>('oidc_payloads').where({ type: 'Client' })).map((p) => {
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
    await db().table<OIDCPayload>('oidc_payloads').update({
      payload,
    }).where({ id: k.id, type: 'Client' })
  }
  if (enableWarnings && lockedClients.length > 0) {
    console.error(`WARNING!!!
      You have OIDC Clients that could not be decrypted with the provided STORAGE_KEY or STORAGE_KEY_SECONDARY.
      This could be due to a mistake while rotating the storage key.
      If you stil have your original STORAGE_KEY, you can set it as the STORAGE_KEY_SECONDARY to recover them.
      Non-decryptable Clients: ${lockedClients.map(c => c.id).join(', ')}`)
  }

  if (decryptableKeys.length || decryptableClients.length) {
    console.log('A storage key rotation was detected, re-encrypted objects decryptable with STORAGE_KEY_SECONDARY with STORAGE_KEY.')
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
