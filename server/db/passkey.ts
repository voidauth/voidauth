import type { Passkey, PasskeyAuthentication, PasskeyRegistration } from '@shared/db/Passkey'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { db } from './db'
import { randomUUID } from 'crypto'
import { createExpiration } from './util'
import { TABLES, TTLs } from '@shared/constants'

export async function getUserPasskeys(userId: string) {
  return (await db().select().table<Passkey>(TABLES.PASSKEY).where({ userId })).map((p) => {
    return {
      ...p,
      transports: p.transports?.split(',') as AuthenticatorTransportFuture[] | undefined,
    }
  })
}

export async function deleteUserPasskeys(userId: string) {
  return await db().delete().table<Passkey>(TABLES.PASSKEY).where({ userId })
}

export async function getPasskey(id: string) {
  return (await db().select().table<Passkey>(TABLES.PASSKEY).where({ id })).map((p) => {
    return {
      ...p,
      transports: p.transports?.split(',') as AuthenticatorTransportFuture[] | undefined,
    }
  })[0]
}

export async function savePasskey(passkey: Passkey) {
  await db().table<Passkey>(TABLES.PASSKEY).insert(passkey)
}

export async function saveRegistrationOptions(registration: PublicKeyCredentialCreationOptionsJSON, uniqueId: string) {
  const id = randomUUID()
  const reg: PasskeyRegistration = {
    id,
    uniqueId,
    value: JSON.stringify(registration),
    expiresAt: createExpiration(TTLs.PASSKEY_REGISTRATION),
  }
  await db().table<PasskeyRegistration>(TABLES.PASSKEY_REGISTRATION).insert(reg).onConflict(['uniqueId']).merge()
}

export async function getRegistrationOptions(uniqueId: string) {
  return await db().select().table<PasskeyRegistration>(TABLES.PASSKEY_REGISTRATION).where({ uniqueId }).first()
}

export async function deleteRegistrationOptions(id: string) {
  return await db().delete().table<PasskeyRegistration>(TABLES.PASSKEY_REGISTRATION).where({ id })
}

export async function saveAuthenticationOptions(interactionId: string, options: PublicKeyCredentialRequestOptionsJSON) {
  const auth: PasskeyAuthentication = {
    id: randomUUID(),
    interactionId,
    value: JSON.stringify(options),
    expiresAt: createExpiration(TTLs.PASSKEY_AUTHN),
  }
  await db().table<PasskeyAuthentication>(TABLES.PASSKEY_AUTHENTICATION).insert(auth).onConflict(['interactionId']).merge()
}

export async function getAuthenticationOptions(interactionId: string) {
  return await db().select().table<PasskeyAuthentication>(TABLES.PASSKEY_AUTHENTICATION).where({ interactionId }).first()
}

export async function deleteAuthenticationOptions(interactionId: string) {
  return await db().delete().table<PasskeyAuthentication>(TABLES.PASSKEY_AUTHENTICATION).where({ interactionId })
}

export async function updatePasskeyCounter(id: string, counter: number) {
  return await db().table<Passkey>(TABLES.PASSKEY).update({ counter }).where({ id })
}
