import { Router } from 'express'
import appConfig from '../util/config'
import { checkLoggedIn, stringValidation } from '../util/validators'
import { generateRegistrationOptions, verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server'
import { getRegistrationOptions, getUserPasskeys, savePasskey, saveRegistrationOptions } from '../db/passkey'
import { validate, validatorData } from '../util/validate'
import type { Passkey } from '@shared/db/Passkey'
import { provider } from '../oidc/provider'
import { TTLs } from '@shared/constants'

const rpName = appConfig.APP_TITLE
const appURL = URL.parse(appConfig.APP_URL) as URL
export const passkeyRpId = appURL.hostname
export const passkeyRpOrigin = `${appURL.protocol}//${appURL.host}`

export const passkeyRouter = Router()

// Must be logged in to register a passkey
passkeyRouter.use(checkLoggedIn)

passkeyRouter.get('/registration',
  async (req, res) => {
    const user = req.user
    const userPasskeys = await getUserPasskeys(user.id)

    const options = await generateRegistrationOptions({
      rpName,
      rpID: passkeyRpId,
      userName: user.username,
      userDisplayName: user.username,
      // Don't prompt users for additional information about the authenticator
      // (Recommended for smoother UX)
      attestationType: 'none',
      // Prevent users from re-registering existing authenticators
      excludeCredentials: userPasskeys.map(passkey => ({
        id: passkey.id,
        // Optional
        transports: passkey.transports,
      })),
      preferredAuthenticatorType: 'localDevice',
      // See "Guiding use of authenticators via authenticatorSelection" below
      authenticatorSelection: {
        // Defaults
        residentKey: 'required',
        userVerification: 'discouraged',
        // Optional
        // authenticatorAttachment: 'platform',
      },
    })

    await saveRegistrationOptions(user.id, options)

    res.send(options)
  },
)

passkeyRouter.post('/registration',
  ...validate<RegistrationResponseJSON>({
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
  }),
  async (req, res) => {
    const body = validatorData<RegistrationResponseJSON>(req)

    // Retrieve the logged-in user
    const user = req.user
    // (Pseudocode) Get `options.challenge` that was saved above
    const regOptions = await getRegistrationOptions(user.id)
    if (!regOptions) {
      res.sendStatus(404)
      return
    }

    const currentOptions = JSON.parse(regOptions.value) as PublicKeyCredentialCreationOptionsJSON

    let verification
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: currentOptions.challenge,
        expectedOrigin: passkeyRpOrigin,
        expectedRPID: passkeyRpId,
        requireUserVerification: false,
        requireUserPresence: false,
      })
    } catch (error) {
      console.error(error)
      res.sendStatus(400)
      return
    }

    const { verified, registrationInfo } = verification
    if (!verified || !registrationInfo) {
      res.sendStatus(400)
      return
    }

    const {
      credential,
      credentialDeviceType,
      credentialBackedUp,
    } = registrationInfo

    const newPasskey: Passkey = {
      // `user` here is from Step 2
      userId: user.id,
      // Created by `generateRegistrationOptions()` in Step 1
      webAuthnUserID: currentOptions.user.id,
      // A unique identifier for the credential
      id: credential.id,
      // The public key bytes, used for subsequent authentication signature verification
      publicKey: credential.publicKey,
      // The number of times the authenticator has been used on this site so far
      counter: credential.counter,
      // How the browser can talk with this credential's authenticator
      transports: credential.transports?.join(','),
      // Whether the passkey is single-device or multi-device
      deviceType: credentialDeviceType,
      // Whether the passkey has been backed up in some way
      backedUp: credentialBackedUp,
    }

    // (Pseudocode) Save the authenticator info so that we can
    // get it by user ID later
    await savePasskey(newPasskey)

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
