import { parseEncrypedData } from '@shared/db/Key'
import appConfig from '../util/config'
import crypto from 'node:crypto'

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
