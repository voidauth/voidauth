import type { Passkey, PasskeyAuthentication, PasskeyRegistration } from '@shared/db/Passkey'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { db } from './db'
import { randomUUID } from 'crypto'
import { createExpiration } from './util'
import { TTLs } from '@shared/constants'

export async function getUserPasskeys(userId: string) {
  return (await db().select().table<Passkey>('passkey').where({ userId })).map((p) => {
    return {
      ...p,
      transports: p.transports?.split(',') as AuthenticatorTransportFuture[] | undefined,
    }
  })
}

export async function getPasskey(id: string) {
  return (await db().select().table<Passkey>('passkey').where({ id })).map((p) => {
    return {
      ...p,
      transports: p.transports?.split(',') as AuthenticatorTransportFuture[] | undefined,
    }
  })[0]
}

export async function savePasskey(passkey: Passkey) {
  await db().table<Passkey>('passkey').insert(passkey)
}

export async function saveRegistrationOptions(userId: string, registration: PublicKeyCredentialCreationOptionsJSON) {
  const reg: PasskeyRegistration = {
    id: randomUUID(),
    userId,
    value: JSON.stringify(registration),
    expiresAt: createExpiration(TTLs.PASSKEY_REGISTRATION),
  }
  await db().table<PasskeyRegistration>('passkey_registration').insert(reg).onConflict(['userId']).merge()
}

export async function getRegistrationOptions(userId: string) {
  return await db().select().table<PasskeyRegistration>('passkey_registration').where({ userId }).first()
}

export async function saveAuthenticationOptions(interactionId: string, options: PublicKeyCredentialRequestOptionsJSON) {
  const auth: PasskeyAuthentication = {
    id: randomUUID(),
    interactionId,
    value: JSON.stringify(options),
    expiresAt: createExpiration(TTLs.PASSKEY_AUTHN),
  }
  await db().table<PasskeyAuthentication>('passkey_authentication').insert(auth).onConflict(['interactionId']).merge()
}

export async function getAuthenticationOptions(interactionId: string) {
  return await db().select().table<PasskeyAuthentication>('passkey_authentication').where({ interactionId }).first()
}

export async function updatePasskeyCounter(id: string, counter: number) {
  return await db().table<Passkey>('passkey').update({ counter }).where({ id })
}
