import type { valueof } from '../utils'
import { KEY_TYPES } from '../constants'
import type { JWK } from 'oidc-provider'

export type Key = {
  id: string
  type: valueof<typeof KEY_TYPES>
  value: string
  metadata: string
  expiresAt: string
}

export type EncryptionMetadata = {
  alg: string
  [k: string]: string
}

export function parseEncryptionMetadata(metadata: string): EncryptionMetadata {
  const parsed: unknown = JSON.parse(metadata)
  if (isEncryptionMetadata(parsed)) {
    return parsed
  }
  throw new Error('Invalid metadata for decryption.')
}

function isEncryptionMetadata(metadata: unknown): metadata is EncryptionMetadata {
  return typeof metadata === 'object'
    && metadata !== null
    && Object.prototype.hasOwnProperty.call(metadata, 'alg')
}

export function isJWK(jwk: unknown): jwk is JWK {
  return typeof jwk === 'object'
    && jwk !== null
    && Object.prototype.hasOwnProperty.call(jwk, 'kid')
}
