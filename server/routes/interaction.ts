import { Router, type Request, type Response } from 'express'
import { getSession, provider } from '../oidc/provider'
import { checkPasswordHash, getUserById, getUserByInput } from '../db/user'
import { addConsent, getConsentScopes, getExistingConsent } from '../db/consent'
import { validate, validatorData } from '../util/validate'
import type { Redirect } from '@shared/api-response/Redirect'
import type { LoginUser } from '@shared/api-request/LoginUser'
import appConfig from '../util/config'
import type { VerifyUserEmail } from '@shared/api-request/VerifyUserEmail'
import { sendEmailVerification } from '../util/email'
import { generate } from 'generate-password'
import type { EmailVerification } from '@shared/db/EmailVerification'
import type { User } from '@shared/db/User'
import { db } from '../db/db'
import type { RegisterUser } from '@shared/api-request/RegisterUser'
import { randomUUID } from 'crypto'
import { REDIRECT_PATHS, TABLES, TTLs } from '@shared/constants'
import { type Interaction } from 'oidc-provider'
import {
  unlessNull, emailValidation, nameValidation,
  newPasswordValidation,
  stringValidation, usernameValidation, uuidValidation,
} from '../util/validators'
import type { ConsentDetails } from '@shared/api-response/ConsentDetails'
import { createExpiration } from '../db/util'
import { getInvitation } from '../db/invitations'
import type { Invitation } from '@shared/db/Invitation'
import type { Consent } from '@shared/db/Consent'
import { getClient } from '../db/client'
import type { InvitationGroup, UserGroup } from '@shared/db/Group'
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import {
  deleteAuthenticationOptions, getAuthenticationOptions,
  getPasskey,
  getUserPasskeys,
  saveAuthenticationOptions,
  updatePasskeyCounter,
} from '../db/passkey'
import {
  passkeyRegistrationValidator,
  passkeyRpId,
  passkeyRpOrigin,
  createPasskeyRegistrationOptions,
  getRegistrationInfo,
  createPasskey,
} from '../util/passkey'
import type { UserDetails } from '@shared/api-response/UserDetails'
import { getEmailVerification } from '../db/emailVerification'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Http2ServerRequest, Http2ServerResponse } from 'http2'
import { createTOTP, validateTOTP } from '../db/totp'
import type { RegisterTotpResponse } from '@shared/api-response/RegisterTotpResponse'
import type { InteractionInfo } from '@shared/api-response/InteractionInfo'
import { amrFactors, isUnapproved, isUnverified, loginFactors } from '@shared/user'
import { logger } from '../util/logger'
import { argon2 } from '../util/argon2id'

const registerUserValidator = {
  username: {
    default: {
      options: null,
    },
    ...unlessNull,
    ...usernameValidation,
  },
  name: nameValidation,
  email: {
    default: {
      options: null,
    },
    optional: true,
    ...unlessNull,
    ...emailValidation,
  },
  inviteId: {
    optional: true,
    ...unlessNull,
    ...stringValidation,
  },
  challenge: {
    optional: true,
    ...unlessNull,
    ...stringValidation,
  },
} as const

export const router = Router()

/**
 *
 * Meta Interaction Routes
 *
 */

/**
 * Direct user to correct page to finish login or consent
 */
router.get('/', async (req, res) => {
  const interaction = await getInteractionDetails(req, res)
  if (!interaction) {
    res.redirect(`${appConfig.APP_URL}/`)
    res.send()
    return
  }
  const { uid, prompt, params } = interaction

  const session = await getSession(req, res)
  const accountId = session?.accountId ?? interaction.result?.login?.accountId
  const user = accountId ? await getUserById(accountId) : undefined

  const logInfo = {
    prompt: prompt.name,
    reasons: prompt.reasons,
    client_id: params.client_id,
    username: user?.username ?? null,
    proxyauth: params.client_id === 'auth_internal_client' && !!params.proxyauth_url,
  }
  logger.debug(`interaction required: ${JSON.stringify(logInfo)}`)

  if (prompt.name === 'login') {
    // Check for prompt reasons that cause special redirects
    if (prompt.reasons.includes('user_not_approved')) {
      // User is not approved, destroy their session/interaction so they can re-attempt login
      await interaction.destroy()
      if (session) {
        await session.destroy()
      }
      res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.APPROVAL_REQUIRED}`)
      res.send()
      return
    } else if (prompt.reasons.includes('user_email_not_validated')) {
      // User does not have a validated email and needs one
      // Send a verification email if possible
      let verificationSent = false
      if (user && !await getEmailVerification(user.id)) {
        verificationSent = await createEmailVerification(user, null)
      }

      res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.VERIFICATION_EMAIL_SENT}/${user?.id ?? ''}?sent=${verificationSent ? 'true' : 'false'}`)
      res.send()
      return
    } else if (prompt.reasons.includes('user_mfa_required')) {
      // User has MFA required, direct them to MFA page
      res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.MFA}`)
      res.send()
      return
    }

    res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.LOGIN}`)
    res.send()
    return
  } else if (prompt.name === 'consent') {
    if (prompt.reasons.includes('consent_prompt')) {
      // consent prompt was requested, always comply
      res.redirect(`${appConfig.APP_URL}/consent/${uid}`)
      res.send()
      return
    }

    if (prompt.reasons.includes('client_mfa_required')) {
      // client requires mfa
      res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.MFA}`)
      res.send()
      return
    }

    // Check conditions to skip consent, after provider has already determined it is required
    const { redirect_uri, client_id, scope } = params
    if (typeof redirect_uri === 'string' && typeof client_id === 'string' && typeof scope === 'string') {
      // Check if the client_id is auth_internal_client
      if (client_id === 'auth_internal_client') {
        const grantId = await applyConsent(interaction)
        const redir = await provider.interactionResult(req, res, { consent: { grantId } }, {
          mergeWithLastSubmission: true,
        })
        res.redirect(redir)
        res.send()
        return
      }

      // Check if client.skip_consent
      const client = await getClient(client_id)
      if (client?.skip_consent) {
        const grantId = await applyConsent(interaction)
        const redir = await provider.interactionResult(req, res, { consent: { grantId } }, {
          mergeWithLastSubmission: true,
        })
        res.redirect(redir)
        res.send()
        return
      }

      // Check if the user has already consented to this client/redirect
      const existingConsent = accountId && await getExistingConsent(accountId, redirect_uri)
      if (existingConsent && !consentMissingScopes(existingConsent, scope).length) {
        const grantId = await applyConsent(interaction)
        const redir = await provider.interactionResult(req, res, { consent: { grantId } }, {
          mergeWithLastSubmission: true,
        })
        res.redirect(redir)
        res.send()
        return
      }
    }

    res.redirect(`${appConfig.APP_URL}/consent/${uid}`)
    res.send()
    return
  } else {
    res.sendStatus(400)
    return
  }
})

/**
 * Gets interaction details that are less specific, no uid required
 */
router.get('/exists', async (req, res) => {
  const interaction = await getInteractionDetails(req, res)
  if (!interaction) {
    res.sendStatus(404)
    return
  }

  // send redirect if interaction is already logged in
  const location = interaction.returnTo
  const success = !!interaction.result?.login?.accountId
  const redir: Redirect | null = success
    ? {
        success,
        location: location,
      }
    : null

  const info: InteractionInfo = {
    successRedirect: redir,
    user: {
      isPrivileged: req.user?.isPrivileged,
    },
  }

  res.send(info)
})

router.delete('/current', async (req, res) => {
  const interaction = await getInteractionDetails(req, res)
  if (!interaction) {
    res.sendStatus(404)
    return
  }

  await interaction.destroy()

  // If session exists, destroy that too
  const session = await getSession(req, res)
  if (session) {
    await session.destroy()
  }

  res.send()
})

/**
 * Get information about current interaction
 */
router.get('/:uid/detail',
  async (req, res) => {
    const interaction = await getInteractionDetails(req, res)
    if (!interaction) {
      res.sendStatus(400)
      return
    }
    const { uid, params } = interaction
    const scope = typeof params.scope === 'string' ? params.scope : ''
    const client = await provider.Client.find(params.client_id as string)
    const details: ConsentDetails = {
      uid: uid,
      clientId: params.client_id as string,
      logoUri: client?.logoUri,
      redirectUri: params.redirect_uri as string,
      scopes: scope.split(' '),
    }

    res.send(details)
  },
)

/**
 * Consent to oidc client
 */
router.post('/:uid/confirm/',
  ...validate<{ uid: string }>({
    uid: stringValidation,
  }),
  async (req, res) => {
    const {
      uid,
      prompt,
      params,
      session,
    } = await provider.interactionDetails(req, res)
    const { uid: uidParam } = validatorData<{ uid: string }>(req)

    if (uid !== uidParam) {
      res.status(419).send({ message: 'Consent form is no longer valid.' })
      return
    }

    if (prompt.name !== 'consent') {
      res.sendStatus(400)
      return
    }

    const grantId = await applyConsent(await provider.interactionDetails(req, res))
    if (typeof params.redirect_uri === 'string' && typeof params.scope === 'string' && session?.accountId) {
      await addConsent(params.redirect_uri, session.accountId, params.scope)
    }
    const redir = await provider.interactionResult(req, res, { consent: { grantId } }, {
      mergeWithLastSubmission: true,
    })
    res.redirect(redir)
    res.send()
    return
  },
)

/**
 *
 * User Registration Routes
 *
 */

/**
 * Register new user with password, finishes login and adds pwd to amr
 */
router.post('/register',
  ...validate<RegisterUser>({
    ...registerUserValidator,
    password: newPasswordValidation,
  }),
  async (req, res) => {
    const registration = validatorData<RegisterUser>(req)

    if (appConfig.EMAIL_VERIFICATION && !registration.email) {
      res.status(400).send({ message: 'EMAIL_VERIFICATION is enabled but no email address was provided during registration.' })
      return
    }

    const interaction = await getInteractionDetails(req, res)
    if (!interaction) {
      const action = registration.inviteId ? 'Invite' : 'Registration'
      res.status(419).send({
        message: `${action} page too old, refresh the page.`,
      })
      return
    }

    const invitation = registration.inviteId ? await getInvitation(registration.inviteId) : null
    const invitationValid = invitation && invitation.challenge === registration.challenge

    if (!invitationValid && !appConfig.SIGNUP) {
      res.sendStatus(400)
      return
    }

    const passwordHash = argon2.hash(registration.password)

    const id = randomUUID()
    const user: User = {
      id: id,
      username: invitation?.username || registration.username,
      name: invitation?.name || registration.name,
      email: invitation?.email || registration.email,
      passwordHash,
      approved: !!invitationValid, // invited users are approved by default
      emailVerified: !!invitation?.email && invitation.emailVerified,
      mfaRequired: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // check username and email not taken
    const conflictingUser = await getUserByInput(user.username)
      || (user.email && await getUserByInput(user.email))

    if (conflictingUser) {
      const message = conflictingUser.username === user.username
        || conflictingUser.email === user.username
        ? 'Username taken.'
        : 'Email taken.'
      res.status(409).send({ message: message })
      return
    }

    // insert user into table
    await db().table<User>(TABLES.USER).insert(user)

    if (invitationValid) {
      const inviteGroups = await db().select().table<InvitationGroup>(TABLES.INVITATION_GROUP)
        .where({ invitationId: invitation.id })

      if (inviteGroups.length) {
        const userGroups: UserGroup[] = inviteGroups.map((g) => {
          return {
            groupId: g.groupId,
            userId: user.id,
            createdBy: g.createdBy,
            updatedBy: g.updatedBy,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        })
        await db().table<UserGroup>(TABLES.USER_GROUP).insert(userGroups)
      }

      await db().table<Invitation>(TABLES.INVITATION).delete().where({ id: invitation.id })

      // Accepted Invitation should redirect to DEFAULT_REDIRECT if set
      const defaultRedirect = appConfig.DEFAULT_REDIRECT
      if (defaultRedirect) {
        interaction.params.redirect_uri = defaultRedirect
        await interaction.save(TTLs.INTERACTION)
      }
    }

    const createdUser = await getUserById(user.id)
    if (!createdUser) {
      throw Error('User was not created during registration when it already should have been.')
    }

    // See where we need to redirect the user to, depending on config
    const redir = await loginResult(req, res, {
      userId: user.id,
      amr: ['pwd'],
    })

    res.send(redir)
  },
)

/**
 * Start user registration using a passkey instead of password
 */
router.post('/register/passkey/start',
  ...validate<{ inviteId?: Invitation['id'], challenge?: Invitation['challenge'] }>({
    inviteId: {
      optional: true,
      ...unlessNull,
      ...stringValidation,
    },
    challenge: {
      optional: true,
      ...unlessNull,
      ...stringValidation,
    },
  }),
  async (req, res) => {
    const invite = validatorData<{ inviteId?: Invitation['id'], challenge?: Invitation['challenge'] }>(req)

    const interaction = await getInteractionDetails(req, res)
    if (!interaction) {
      const action = invite.inviteId ? 'Invite' : 'Registration'
      res.status(419).send({
        message: `${action} page too old, refresh the page.`,
      })
      return
    }

    // check open signup or valid invitation
    // Make sure that if invitation, it is valid
    const invitation = invite.inviteId ? await getInvitation(invite.inviteId) : null
    const invitationValid = invitation && invitation.challenge === invite.challenge
    if (!invitationValid && !appConfig.SIGNUP) {
      res.sendStatus(400)
      return
    }

    const options = await createPasskeyRegistrationOptions(interaction.uid)

    res.send(options)
  },
)

/**
 * Finish user registration using a passkey instead of password, finishes login and adds webauthn to amr
 */
router.post('/register/passkey/end',
  ...validate<RegistrationResponseJSON & Omit<RegisterUser, 'password'>>({
    ...passkeyRegistrationValidator,
    ...registerUserValidator,
  }),
  async (req, res) => {
    const registration = validatorData<RegistrationResponseJSON & Omit<RegisterUser, 'password'>>(req)

    if (appConfig.EMAIL_VERIFICATION && !registration.email) {
      res.status(400).send({ message: 'EMAIL_VERIFICATION is enabled but no email address was provided during registration.' })
      return
    }

    const interaction = await getInteractionDetails(req, res)
    if (!interaction) {
      res.status(419).send({
        message: `Page too old, refresh the page.`,
      })
      return
    }

    // Make sure that if invitation, it is valid
    const invitation = registration.inviteId ? await getInvitation(registration.inviteId) : null
    const invitationValid = invitation && invitation.challenge === registration.challenge

    if (!invitationValid && !appConfig.SIGNUP) {
      res.sendStatus(400)
      return
    }

    const { verification, currentOptions } = await getRegistrationInfo(interaction.uid, registration)

    const { verified, registrationInfo } = verification
    if (!verified) {
      res.sendStatus(400)
      return
    }

    const id = randomUUID()
    const user: User = {
      id: id,
      username: invitation?.username || registration.username,
      name: invitation?.name || registration.name,
      email: invitation?.email || registration.email,
      approved: !!invitationValid, // invited users are approved by default
      emailVerified: !!invitation?.email && invitation.emailVerified,
      mfaRequired: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // check username and email not taken
    const conflictingUser = await getUserByInput(user.username)
      || (user.email && await getUserByInput(user.email))

    if (conflictingUser) {
      const message = conflictingUser.username === user.username
        || conflictingUser.email === user.username
        ? 'Username taken.'
        : 'Email taken.'
      res.status(409).send({ message: message })
      return
    }

    // insert user into table
    await db().table<User>(TABLES.USER).insert(user)

    if (invitationValid) {
      const inviteGroups = await db().select().table<InvitationGroup>(TABLES.INVITATION_GROUP)
        .where({ invitationId: invitation.id })

      if (inviteGroups.length) {
        const userGroups: UserGroup[] = inviteGroups.map((g) => {
          return {
            groupId: g.groupId,
            userId: user.id,
            createdBy: g.createdBy,
            updatedBy: g.updatedBy,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        })
        await db().table<UserGroup>(TABLES.USER_GROUP).insert(userGroups)
      }

      await db().table<Invitation>(TABLES.INVITATION).delete().where({ id: invitation.id })

      // Accepted Invitation should redirect to DEFAULT_REDIRECT if set
      const defaultRedirect = appConfig.DEFAULT_REDIRECT
      if (defaultRedirect) {
        interaction.params.redirect_uri = defaultRedirect
        await interaction.save(TTLs.INTERACTION)
      }
    }

    const createdUser = await getUserById(user.id)
    if (!createdUser) {
      throw Error('User was not created during registration when it already should have been.')
    }

    await createPasskey(createdUser.id, registrationInfo, currentOptions)

    // See where we need to redirect the user to, depending on config
    const redir = await loginResult(req, res, {
      userId: user.id,
      amr: ['webauthn'],
    })

    res.send(redir)
  },
)

/**
 *
 * Register AMR Routes
 *
 */

/**
 * Start registering a passkey
 */
router.post('/passkey/registration/start',
  async (req, res) => {
    // Should only be able to register if fully logged in
    const user = req.user

    if (!user?.isPrivileged) {
      res.sendStatus(401)
      return
    }

    const userPasskeys = await getUserPasskeys(user.id)

    const options = await createPasskeyRegistrationOptions(user.id, user.username, userPasskeys)

    res.send(options)
  },
)

/**
 * Finish registering a passkey, finishes login and adds webauthn to amr
 */
router.post('/passkey/registration/end',
  ...validate<RegistrationResponseJSON>(passkeyRegistrationValidator),
  async (req, res) => {
    const body = validatorData<RegistrationResponseJSON>(req)

    // Should only be able to register if fully logged in
    const user = req.user

    if (!user?.isPrivileged) {
      res.sendStatus(401)
      return
    }

    const { verification, currentOptions } = await getRegistrationInfo(user.id, body)

    const { verified, registrationInfo } = verification
    if (!verified) {
      res.sendStatus(400)
      return
    }

    await createPasskey(user.id, registrationInfo, currentOptions)

    const redir = await loginResult(req, res, {
      userId: user.id,
      amr: ['webauthn'],
    })

    res.send(redir)
  },
)

/**
 * Register a new totp, needs to be verified afterwards or it expires
 */
router.post('/totp/registration',
  async (req, res) => {
    // Should only be able to register if fully logged in,
    // OR could not otherwise MFA
    // partially logged in users may be prompted to add MFA
    const user = req.user

    if (!user) {
      res.sendStatus(401)
      return
    }

    const firstTotpAllowed = !user.hasTotp && !!loginFactors(user.amr)
      && !isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL) && !isUnverified(user, !!appConfig.EMAIL_VERIFICATION)

    if (!user.isPrivileged && !firstTotpAllowed) {
      res.sendStatus(401)
      return
    }

    const response: RegisterTotpResponse = await createTOTP(user.id, user.username)

    res.send(response)
  },
)

/**
 *
 * AMR Action Routes
 *
 */

/**
 * Login with password, finishes login and adds pwd to amr
 */
router.post('/login',
  ...validate<LoginUser>({
    input: {
      ...stringValidation,
      isLength: { options: { min: 1, max: 32 } },
      toLowerCase: true,
    },
    password: stringValidation,
    remember: {
      optional: true,
      isBoolean: true,
    },
  }),
  async (req, res) => {
    const interaction = await getInteractionDetails(req, res)
    const session = await getSession(req, res)
    if (!interaction && !session?.accountId) {
      res.status(419).send({
        message: 'Login page too old, refresh the page.',
      })
      return
    }

    const { input, password, remember } = validatorData<LoginUser>(req)

    const user = await getUserByInput(input)
    if (!user) {
      res.sendStatus(401)
      return
    }

    // check user password
    if (!await checkPasswordHash(user.id, password)) {
      res.sendStatus(401)
      return
    }

    // check if email verification or approval needed, if not log in
    const redir = await loginResult(req, res, {
      userId: user.id,
      amr: ['pwd'],
      remember,
    })

    res.send(redir)
  },
)

/**
 * Start login with passkey
 */
router.post('/passkey/start',
  async (req, res) => {
    const interaction = await getInteractionDetails(req, res)
    const session = await getSession(req, res)
    if (!interaction && !session?.accountId) {
      res.status(419).send({
        message: 'Login page too old, refresh the page.',
      })
      return
    }

    const userId = interaction?.result?.login?.accountId || session?.accountId
    const passkeys = userId ? await getUserPasskeys(userId) : []

    const options: PublicKeyCredentialRequestOptionsJSON = await generateAuthenticationOptions({
      rpID: passkeyRpId,
      allowCredentials: passkeys,
    })

    // (Pseudocode) Remember this challenge for this user
    await saveAuthenticationOptions((interaction?.uid ?? session?.uid) as string, options)

    res.send(options)
    return
  },
)

/**
 * Finish login with passkey, finishes login and adds webauthn to amr
 */
router.post('/passkey/end',
  ...validate<AuthenticationResponseJSON>({
    id: stringValidation,
    rawId: stringValidation,
    'response.clientDataJSON': stringValidation,
    'response.authenticatorData': stringValidation,
    'response.signature': stringValidation,
    'response.userHandle': {
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
    const interaction = await getInteractionDetails(req, res)
    const session = await getSession(req, res)
    if (!interaction && !session?.accountId) {
      res.status(419).send({
        message: 'Login page too old, refresh the page.',
      })
      return
    }

    const body = validatorData<AuthenticationResponseJSON>(req)

    const authOptions = await getAuthenticationOptions((interaction?.uid ?? session?.uid) as string)

    if (!authOptions) {
      res.sendStatus(404)
      return
    }

    await deleteAuthenticationOptions((interaction?.uid ?? session?.uid) as string)

    const currentOptions = JSON.parse(authOptions.value) as PublicKeyCredentialRequestOptionsJSON

    const passkey = await getPasskey(body.id)

    if (!passkey) {
      res.sendStatus(404)
      return
    }

    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: currentOptions.challenge,
        expectedOrigin: passkeyRpOrigin,
        expectedRPID: passkeyRpId,
        requireUserVerification: false,
        credential: {
          id: passkey.id,
          publicKey: passkey.publicKey,
          counter: passkey.counter,
          transports: passkey.transports,
        },
      })
    } catch (_error) {
      res.sendStatus(401)
      return
    }

    const { verified, authenticationInfo } = verification
    if (!verified) {
      res.sendStatus(400)
      return
    }

    await updatePasskeyCounter(passkey.id, authenticationInfo.newCounter)

    const user = await getUserById(passkey.userId)

    // check user
    if (!user) {
      res.sendStatus(401)
      return
    }

    const redir = await loginResult(req, res, {
      userId: user.id,
      amr: ['webauthn'],
    })

    res.send(redir)
  },
)

/**
 * Validate totp and add totp to amr
 */
router.post('/totp',
  ...validate<{ token: string, enableMfa?: boolean }>({
    enableMfa: {
      optional: true,
      isBoolean: true,
      toBoolean: true,
    },
    token: {
      ...stringValidation,
    },
  }),
  async (req, res) => {
    // Should only be able to register if fully logged in,
    // OR could not otherwise MFA
    // partially logged in users may be prompted to add MFA
    const user = req.user

    if (!user) {
      res.sendStatus(401)
      return
    }

    if (!loginFactors(user.amr)
      || isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL) || isUnverified(user, !!appConfig.EMAIL_VERIFICATION)) {
      res.sendStatus(401)
      return
    }

    const { token, enableMfa } = validatorData<{ token: string, enableMfa?: boolean }>(req)

    if (!await validateTOTP(user.id, token)) {
      res.sendStatus(401)
      return
    }

    if (enableMfa) {
      await db().table<User>(TABLES.USER).update({ mfaRequired: true }).where({ id: user.id })
    }

    const redir = await loginResult(req, res, {
      userId: user.id,
      amr: ['totp'],
    })

    res.send(redir)
  },
)

/**
 * Verify an email, finishes login adds email to amr
 */
router.post('/verify_email',
  ...validate<VerifyUserEmail>({
    userId: uuidValidation,
    challenge: stringValidation,
  }),
  async (req, res) => {
    const { userId, challenge } = validatorData<VerifyUserEmail>(req)

    const interaction = await getInteractionDetails(req, res)
    const session = await getSession(req, res)
    if (!interaction && !session?.accountId) {
      res.status(419).send({
        message: 'Email Verification page too old, refresh the page.',
      })
      return
    }

    const user = await getUserById(userId)
    if (!user) {
      res.sendStatus(404)
      return
    }

    const emailVerification = await getEmailVerification(userId)
    if (!emailVerification) {
      res.sendStatus(404)
      return
    }

    if (emailVerification.challenge !== challenge) {
      res.sendStatus(404)
      return
    }

    // TODO: if user email does not match verification email, send an update to the old email
    await db().table<User>(TABLES.USER).where('id', user.id).update({
      emailVerified: true,
      email: emailVerification.email,
    })
    await db().delete().table<EmailVerification>(TABLES.EMAIL_VERIFICATION).where(emailVerification)

    // Email verification should redirect to DEFAULT_REDIRECT if set
    const defaultRedirect = appConfig.DEFAULT_REDIRECT
    if (defaultRedirect && interaction) {
      interaction.params.redirect_uri = defaultRedirect
      await interaction.save(TTLs.INTERACTION)
    }

    const redir = await loginResult(req, res, {
      userId: user.id,
      amr: ['email'],
    })

    res.send(redir)
    return
  },
)

async function loginResult(req: Request, res: Response, options: {
  amr: string[]
  userId: string
  remember?: boolean
}): Promise<Redirect | undefined> {
  let { amr } = options
  const { userId, remember = false } = options
  const includesFirstFactorAmr = amrFactors.firstFactors.some(f => amr.includes(f))

  try {
    const session = await getSession(req, res)
    if (session?.accountId === userId) {
      // merge amr if amr is not firstFactor
      if (!includesFirstFactorAmr) {
        amr = [...new Set([...amr, ...(session.amr ?? [])])]
      }
      session.amr = amr
      await session.save(TTLs.SESSION)
    }
  } catch (_e) {
    // if no session, there is no error
  }

  try {
    const interaction = await getInteractionDetails(req, res)

    if (interaction) {
      if (interaction.result?.login?.accountId === userId) {
        // merge amr if amr is not firstFactor
        if (!includesFirstFactorAmr) {
          amr = [...new Set([...amr, ...(interaction.result.login.amr ?? [])])]
        }
        interaction.result.login.amr = amr
        await interaction.save(TTLs.INTERACTION)
      }

      return {
        success: true,
        location: await provider.interactionResult(req, res, {
          login: {
            accountId: userId,
            remember: interaction.result?.login?.remember || remember,
            amr: amr,
          },
        },
        { mergeWithLastSubmission: true }),
      }
    }
  } catch (_e) {
    // if there is no interaction, there is no error
  }
}

export async function getInteractionDetails(req: IncomingMessage | Http2ServerRequest, res: ServerResponse | Http2ServerResponse) {
  try {
    return await provider.interactionDetails(req, res)
  } catch (_e) {
    return null
  }
}

function consentMissingScopes(consent: Consent, scope: string) {
  const scopes = scope.split(',').map(s => s.trim())
  const consentScopes = getConsentScopes(consent)
  return scopes.filter((s) => {
    return !consentScopes.includes(s)
  })
}

async function applyConsent(interactionDetails: Interaction) {
  const {
    prompt,
    params,
    session,
  } = interactionDetails

  const { details } = prompt
  const accountId = session?.accountId

  let grant = !!interactionDetails.grantId && await provider.Grant.find(interactionDetails.grantId)

  if (!grant) {
    grant = new provider.Grant({
      accountId,
      clientId: params.client_id as string,
    })
  }

  if (details.missingOIDCScope instanceof Array) {
    grant.addOIDCScope(details.missingOIDCScope.join(' '))
  }
  if (details.missingOIDCClaims instanceof Array) {
    grant.addOIDCClaims(details.missingOIDCClaims as string[])
  }
  if (details.missingResourceScopes) {
    for (const [indicator, scopes] of Object.entries(
      details.missingResourceScopes,
    )) {
      grant.addResourceScope(indicator, (scopes as string[]).join(' '))
    }
  }

  const grantId = await grant.save()
  return grantId
}

export async function createEmailVerification(
  user: UserDetails,
  email?: string | null) {
  // Do not create an email verification for an unapproved user
  if (isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL)) {
    return false
  }

  const sentEmail = email ?? user.email
  if (!sentEmail) {
    return false
  }

  // generate email verification challenge
  const challenge = generate({
    length: 32,
    numbers: true,
  })
  const email_verification: EmailVerification = {
    id: randomUUID(),
    userId: user.id,
    email: sentEmail,
    challenge: challenge,
    expiresAt: createExpiration(TTLs.VERIFICATION_EMAIL),
    createdAt: new Date(),
  }
  // insert new email verification challenge
  await db().table<EmailVerification>(TABLES.EMAIL_VERIFICATION).insert(email_verification)
  await sendEmailVerification(user, challenge, sentEmail)
  return true
}
