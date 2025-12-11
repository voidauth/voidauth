import { type Key } from '@shared/db/Key'
import appConfig from '../util/config'
import { db } from './db'
import { KEY_TYPES, TABLES, TTLs } from '@shared/constants'
import { createExpiration, decryptString, encryptString, pastHalfExpired } from './util'
import crypto from 'node:crypto'
import * as jose from 'jose'

/**
 * Get the Cookie Signing Keys from the DB
 */
export async function getCookieKeys() {
  const keys = (await db()
    .select()
    .table<Key>(TABLES.KEY)
    .where({ type: KEY_TYPES.COOKIE_KEY }).andWhere('expiresAt', '>=', new Date())
    .orderBy('expiresAt', 'desc'))
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

  await db().table<Key>(TABLES.KEY).insert(key)
}

/**
 * Get OIDC JWK
 */
export async function getJWKs() {
  const keys = (await db()
    .select()
    .table<Key>(TABLES.KEY)
    .where({ type: KEY_TYPES.OIDC_JWK }).andWhere('expiresAt', '>=', new Date())
    .orderBy('expiresAt', 'desc'))
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

  await db().table<Key>(TABLES.KEY).insert(key)
}

export async function makeKeysValid() {
  // check cookie key exist with more than half its ttl left, and if not create one
  const cookieKeys = await getCookieKeys()
  if (!cookieKeys.some(k => !pastHalfExpired(TTLs.COOKIE_KEY, k.expiresAt))) {
    // there is no cookie key with greater than half its life left, create a new one
    await createCookieKey()
  }

  // check JWK exist with more than half its ttl left, and if not create one
  const jwks = await getJWKs()
  if (!jwks.some(k => !pastHalfExpired(TTLs.OIDC_JWK, k.expiresAt))) {
    // there are no jwk with greater than half its life left, create a new one
    await createJWK()
  }
}
