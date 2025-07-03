import type { User } from './User'

export type Passkey = {
  id: string
  publicKey: Uint8Array
  userId: User['id']
  webAuthnUserID: string
  counter: number
  deviceType: string
  backedUp: boolean
  transports?: string | null // CSV array
}

export type PasskeyRegistration = {
  id: string
  userId: string
  value: string
  expiresAt: Date
}

export type PasskeyAuthentication = {
  id: string
  interactionId: string
  value: string
  expiresAt: Date
}
