import type { DBColumnTypesCheck } from '@shared/db'
import type { Audit } from './Audit'
import type { User } from './User'

export type Passkey = Pick<Audit, 'createdAt'> & {
  id: string
  displayName: string | null
  publicKey: Uint8Array<ArrayBuffer>
  userId: User['id']
  webAuthnUserID: string
  counter: number
  deviceType: string
  backedUp: boolean | number
  transports?: string | null // CSV array

  lastUsed: Date | number
}

const _typeCheckPasskey: DBColumnTypesCheck<Passkey> = true

export type PasskeyRegistration = {
  id: string
  uniqueId: string
  value: string
  expiresAt: Date | number
}

const _typeCheckPasskeyRegistration: DBColumnTypesCheck<PasskeyRegistration> = true

export type PasskeyAuthentication = {
  id: string
  interactionId: string
  value: string
  expiresAt: Date | number
}

const _typeCheckPasskeyAuthentication: DBColumnTypesCheck<PasskeyAuthentication> = true
