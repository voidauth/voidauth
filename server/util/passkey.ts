import appConfig, { appUrl } from './config'
import { stringValidation } from './validators'
import { generateRegistrationOptions,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type VerifiedRegistrationResponse } from '@simplewebauthn/server'
import { deleteRegistrationOptions, getRegistrationOptions, savePasskey, saveRegistrationOptions } from '../db/passkey'
import type { Passkey } from '@shared/db/Passkey'
import { commit, transaction } from '../db/db'

const passkeyRpName = appConfig.APP_TITLE
export const passkeyRpId = appUrl().hostname
export const passkeyRpOrigin = `${appUrl().protocol}//${appUrl().host}`

export const passkeyRegistrationValidator = {
  id: stringValidation,
  rawId: stringValidation,
  'response.clientDataJSON': stringValidation,
  'response.attestationObject': stringValidation,
  'response.authenticatorData': {
    optional: true,
    ...stringValidation,
  },
  'response.transports': {
    optional: true,
    isArray: true,
  },
  'response.transports.*': {
    optional: true,
    ...stringValidation,
  },
  'response.publicKeyAlgorithm': {
    optional: true,
    isNumeric: true,
  },
  'response.publicKey': {
    optional: true,
    ...stringValidation,
  },
  authenticatorAttachment: {
    optional: true,
    ...stringValidation,
  },
  'clientExtensionResults.appid': {
    optional: true,
    isBoolean: true,
  },
  'clientExtensionResults.credProps.rk': {
    optional: true,
    isBoolean: true,
  },
  'clientExtensionResults.hmacCreateSecret': {
    optional: true,
    isBoolean: true,
  },
  type: stringValidation,
} as const

export async function createPasskeyRegistrationOptions(uniqueId: string, username?: string, excludeCredentials?: {
  id: Base64URLString
  transports?: AuthenticatorTransportFuture[]
}[]) {
  const options = await generateRegistrationOptions({
    rpName: passkeyRpName,
    rpID: passkeyRpId,
    userName: username ?? '',
    userDisplayName: username ?? '',
    attestationType: 'none', // attestation not supported
    // Prevent users from re-registering existing authenticators
    excludeCredentials: excludeCredentials,
    authenticatorSelection: {
      // Defaults
      residentKey: 'required',
      userVerification: 'preferred',
    },
  })

  await saveRegistrationOptions(options, uniqueId)

  return options
}

export async function getRegistrationInfo(uniqueId: string, response: RegistrationResponseJSON) {
  // Get `options.challenge` that was saved above
  const regOptions = await getRegistrationOptions(uniqueId)
  if (!regOptions) {
    throw Error('User not found')
  }

  // Lock in the registration delete, even if we have errors later
  // Prevents replay attacks
  await deleteRegistrationOptions(regOptions.id)
  await commit()
  await transaction()

  const currentOptions = JSON.parse(regOptions.value) as PublicKeyCredentialCreationOptionsJSON

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: currentOptions.challenge,
    expectedOrigin: passkeyRpOrigin,
    expectedRPID: passkeyRpId,
    requireUserVerification: false,
    requireUserPresence: false,
  })

  return { verification, currentOptions }
}

export async function createPasskey(userId: string,
  registrationInfo: Required<VerifiedRegistrationResponse>['registrationInfo'],
  currentOptions: PublicKeyCredentialCreationOptionsJSON) {
  const newPasskey: Passkey = {
    // `user` here is from Step 2
    userId: userId,
    // Created by `generateRegistrationOptions()` in Step 1
    webAuthnUserID: currentOptions.user.id,
    // A unique identifier for the credential
    id: registrationInfo.credential.id,
    // The public key bytes, used for subsequent authentication signature verification
    publicKey: registrationInfo.credential.publicKey,
    // The number of times the authenticator has been used on this site so far
    counter: registrationInfo.credential.counter,
    // How the browser can talk with this credential's authenticator
    transports: registrationInfo.credential.transports?.join(','),
    // Whether the passkey is single-device or multi-device
    deviceType: registrationInfo.credentialDeviceType,
    // Whether the passkey has been backed up in some way
    backedUp: registrationInfo.credentialBackedUp,
  }

  // (Pseudocode) Save the authenticator info so that we can
  // get it by user ID later
  await savePasskey(newPasskey)
}
