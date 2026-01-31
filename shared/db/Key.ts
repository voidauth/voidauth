import type { ValueOf } from '../utils'
import { KEY_TYPES } from '../constants'
import type { JWK } from 'oidc-provider'

export type Key = {
  id: string
  type: ValueOf<typeof KEY_TYPES>
  value: string // Should be stringified EncryptedData
  expiresAt: Date | number
}

export type EncryptionMetadata = {
  alg: string
  [k: string]: string
}

export type EncryptedData = { value: string, metadata: EncryptionMetadata }

export function parseEncrypedData(data: string): EncryptedData | null {
  const parsed: unknown = JSON.parse(data)
  if (isEncryptedData(parsed)) {
    return parsed
  }
  return null
}

function isEncryptionMetadata(metadata: unknown): metadata is EncryptionMetadata {
  return typeof metadata === 'object'
    && metadata !== null
    && 'alg' in metadata
}

export function isEncryptedData(data: unknown): data is EncryptedData {
  return typeof data === 'object'
    && data !== null
    && 'value' in data
    && 'metadata' in data
    && isEncryptionMetadata(data.metadata)
}

export function isJWK(jwk: unknown): jwk is JWK {
  return typeof jwk === 'object'
    && jwk !== null
    && Object.prototype.hasOwnProperty.call(jwk, 'kid')
}
