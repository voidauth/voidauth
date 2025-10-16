import type { User } from './User'

export type Passkey = {
  id: string
  publicKey: Uint8Array<ArrayBuffer>
  userId: User['id']
  webAuthnUserID: string
  counter: number
  deviceType: string
  backedUp: boolean | number
  transports?: string | null // CSV array
}

export type PasskeyRegistration = {
  id: string
  uniqueId: string
  value: string
  expiresAt: Date | number
}

export type PasskeyAuthentication = {
  id: string
  interactionId: string
  value: string
  expiresAt: Date | number
}
