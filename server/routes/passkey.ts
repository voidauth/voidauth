import { Router } from 'express'
import appConfig from '../util/config'
import { checkLoggedIn, stringValidation } from '../util/validators'
import { generateRegistrationOptions,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type VerifiedRegistrationResponse } from '@simplewebauthn/server'
import { deleteRegistrationOptions, getRegistrationOptions, getUserPasskeys, savePasskey, saveRegistrationOptions } from '../db/passkey'
import { validate, validatorData } from '../util/validate'
import type { Passkey } from '@shared/db/Passkey'
import { provider } from '../oidc/provider'
import { TTLs } from '@shared/constants'
import { commit, transaction } from '../db/db'

const passkeyRpName = appConfig.APP_TITLE
const appURL = URL.parse(appConfig.APP_URL) as URL
export const passkeyRpId = appURL.hostname
export const passkeyRpOrigin = `${appURL.protocol}//${appURL.host}`

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

export const passkeyRouter = Router()

// Must be logged in to register a passkey
passkeyRouter.use(checkLoggedIn)

passkeyRouter.post('/registration/start',
  async (req, res) => {
    const user = req.user

    const userPasskeys = await getUserPasskeys(user.id)

    const options = await createPasskeyRegistrationOptions(user.id, user.username, userPasskeys)

    res.send(options)
  },
)

passkeyRouter.post('/registration/end',
  ...validate<RegistrationResponseJSON>(passkeyRegistrationValidator),
  async (req, res) => {
    const body = validatorData<RegistrationResponseJSON>(req)

    // Retrieve the logged-in user
    const user = req.user

    const { verification, currentOptions } = await getRegistrationInfo(user.id, body)

    const { verified, registrationInfo } = verification
    if (!verified || !registrationInfo) {
      res.sendStatus(400)
      return
    }

    await createPasskey(user.id, registrationInfo, currentOptions)

    // Try to add webauthn to session amr
    try {
      const ctx = provider.createContext(req, res)
      const session = await provider.Session.get(ctx)
      const amr = session.amr ?? []
      if (!amr.includes('webauthn')) {
        amr.push('webauthn')
      }
      session.amr = amr
      await session.save(TTLs.SESSION)
    } catch (e) {
      console.error(e)
    }

    res.send()
  },
)

export async function createPasskeyRegistrationOptions(uniqueId: string, username?: string, excludeCredentials?: {
  id: Base64URLString
  transports?: AuthenticatorTransportFuture[]
}[]) {
  const options = await generateRegistrationOptions({
    rpName: passkeyRpName,
    rpID: passkeyRpId,
    userName: username ?? '',
    userDisplayName: username ?? '',
    // Don't prompt users for additional information about the authenticator
    // (Recommended for smoother UX)
    attestationType: 'none',
    // Prevent users from re-registering existing authenticators
    excludeCredentials: excludeCredentials,
    // preferredAuthenticatorType: 'localDevice',
    // See "Guiding use of authenticators via authenticatorSelection" below
    authenticatorSelection: {
      // Defaults
      residentKey: 'required',
      userVerification: 'preferred',
      // Optional
      // authenticatorAttachment: 'platform',
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
