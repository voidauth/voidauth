import { parseEncrypedData, type Key } from '@shared/db/Key'
import appConfig from '../util/config'
import { commit, createTransaction, db, rollback } from './db'
import { KEY_TYPES, TTLs } from '@shared/constants'
import { createExpiration, pastHalfExpired, isExpired } from './util'
import { als } from '../util/als'
import crypto from 'node:crypto'
import * as jose from 'jose'

export async function makeKeysValid() {
  // clear out all expired keys
  await clearExpiredKeys()

  // update encrypted keys to use the latest storage encryption key
  await updateStorageKey()

  // check valid cookie key exist, and if not create one
  const cookieKeys = await getCookieKeys()
  if (!cookieKeys.some(k => !pastHalfExpired(TTLs.COOKIE_KEY, k.expiresAt))) {
    // there is no cookie key with greater than half its life left, create a new one
    await createCookieKey()
  }

  // check valid JWK exist, and if not create one
  const jwks = await getJWKs()
  if (!jwks.some(k => !pastHalfExpired(TTLs.OIDC_JWK, k.expiresAt))) {
    // there are no jwk with greater than half its life left, create a new one
    await createJWK()
  }
}

/**
 * Get the Cookie Signing Keys from the DB
 */
export async function getCookieKeys() {
  const keys = (await db()
    .select()
    .table<Key>('key')
    .where({ type: KEY_TYPES.COOKIE_KEY }))
    .filter(k => !isExpired(k.expiresAt))
    .sort((a, b) => {
      return new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime()
    })
    .reduce<Key[]>((ks, k) => {
      const value = decryptString(k.value, [appConfig.STORAGE_KEY, appConfig.STORAGE_KEY_SECONDARY])
      if (value) {
        ks.push({ ...k, value })
      }
      return ks
    }, [])

  return keys
}

/**
 * Create a Cookie Signing Key
 */
async function createCookieKey() {
  const keyValue = crypto.randomBytes(32).toString('base64url')

  const value = encryptString(keyValue)

  const key: Key = {
    id: crypto.randomUUID(),
    type: KEY_TYPES.COOKIE_KEY,
    value,
    expiresAt: createExpiration(TTLs.COOKIE_KEY),
  }

  await db().table<Key>('key').insert(key)
}

/**
 * Get OIDC JWK
 */
export async function getJWKs() {
  const keys = (await db()
    .select()
    .table<Key>('key')
    .where({ type: KEY_TYPES.OIDC_JWK }))
    .filter(k => !isExpired(k.expiresAt))
    .sort((a, b) => {
      return new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime()
    })
    .reduce<Key[]>((ks, k) => {
      const value = decryptString(k.value, [appConfig.STORAGE_KEY, appConfig.STORAGE_KEY_SECONDARY])
      if (value) {
        ks.push({ ...k, value })
      }
      return ks
    }, [])

  return keys.map((k) => {
    return {
      ...k,
      jwk: JSON.parse(k.value) as jose.JWK,
    }
  })
}

/**
 * Create a OIDC JWK
 */
async function createJWK() {
  const { privateKey } = await jose.generateKeyPair('RS256', {
    extractable: true,
    modulusLength: 2048,
  })
  const jwk = await jose.exportJWK(privateKey)
  jwk.kid = crypto.randomUUID()
  jwk.use = 'sig'
  jwk.alg = 'RS256'

  const value = encryptString(JSON.stringify(jwk))

  const key: Key = {
    id: crypto.randomUUID(),
    type: KEY_TYPES.OIDC_JWK,
    value,
    expiresAt: createExpiration(TTLs.OIDC_JWK),
  }

  await db().table<Key>('key').insert(key)
}

/**
 * Remove all expired keys from the DB
 */
async function clearExpiredKeys() {
  const expiredKeys = (await db()
    .select()
    .table<Key>('key')
    .where({ type: KEY_TYPES.COOKIE_KEY }))
    .filter(k => isExpired(k.expiresAt))

  await db().delete().table<Key>('key').whereIn('id', expiredKeys.map(k => k.id))
}

async function updateStorageKey() {
  // find any that cannot be decrypted with STORAGE_KEY
  const stale = (await db()
    .select()
    .table<Key>('key'))
    .filter(k => !isExpired(k.expiresAt)
      && decryptString(k.value, [appConfig.STORAGE_KEY]) === null)

  // find those that CAN be decrypted with STORAGE_KEY_SECONDARY
  const refreshed = stale.reduce<Key[]>((ks, k) => {
    const value = decryptString(k.value, [appConfig.STORAGE_KEY_SECONDARY])
    if (value) {
      ks.push({ ...k, value })
    }
    return ks
  }, [])

  // for those, re-encrypt with STORAGE_KEY
  for (const k of refreshed) {
    const value = encryptString(k.value)
    await db().table<Key>('key').update({
      value,
    }).where({ id: k.id })
  }

  // find keys that could not be decrypted
  const locked = stale.filter(k => !refreshed.some(r => r.id === k.id))

  // warn if there were any that could not be decrypted
  if (locked.length) {
    // await db().table<Key>('key').delete().whereIn('id', locked.map(k => k.id))
    console.error('WARNING!')
    console.error('You had key(s) that could not be decrypted with the provided STORAGE_KEY.')
    console.error('This could be due to a mistake while rotating the STORAGE_KEY to the STORAGE_KEY_SECONDARY.')
    // console.error('New Keys were generated to replace them, this invalidated all sessions and tokens.')
  }
}

/**
 * Encrypt a string
 */
export function encryptString(v: string) {
  const iv = crypto.randomBytes(12).toString('base64url')
  const alg = 'aes-256-gcm'
  const cipher = crypto.createCipheriv(alg,
    crypto.createHash('sha256').update(appConfig.STORAGE_KEY).digest(),
    Buffer.from(iv, 'base64url'))

  let value = cipher.update(v, 'utf8', 'base64url')
  value += cipher.final('base64url')

  const tag = cipher.getAuthTag().toString('base64url')

  return JSON.stringify({
    value,
    metadata: {
      alg, iv, tag,
    },
  })
}

/**
 * Decrypt a key
 * If key cannot be decrypted for any reason, returns null
 */
export function decryptString(input: string, storageKeys: (string | undefined)[]): string | null {
  let value: string | null = null
  const encrypted = parseEncrypedData(input)
  if (!encrypted) {
    return null
  }

  if (encrypted.metadata.alg === 'aes-256-gcm') {
    if (!encrypted.metadata.iv || !encrypted.metadata.tag) {
      console.error('Key metadata is missing required properties.')
      return null
    }

    for (const encKey of storageKeys) {
      try {
        if (!encKey) {
          continue
        }
        const decipher = crypto.createDecipheriv(encrypted.metadata.alg,
          crypto.createHash('sha256').update(encKey).digest(),
          Buffer.from(encrypted.metadata.iv, 'base64url'))
        decipher.setAuthTag(Buffer.from(encrypted.metadata.tag, 'base64url'))
        let decrypted = decipher.update(encrypted.value, 'base64url', 'utf8')
        decrypted += decipher.final('utf-8')
        value = decrypted
        break
      } catch (_e) {
        // Try the other storage key
      }
    }
  } else {
    console.error('Encrypted storage algorithm not recognized.')
    return null
  }

  return value
}

// Do initial key setup and cleanup
await als.run({}, async () => {
  await createTransaction()
  try {
    await makeKeysValid()
    await commit()
  } catch (e) {
    await rollback()
    throw e
  }
})
