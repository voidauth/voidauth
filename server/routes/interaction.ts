import { Router, type Response } from 'express'
import { getSession, provider } from '../oidc/provider'
import { checkPasswordHash, getUserById, getUserByInput } from '../db/user'
import { addConsent, getConsentScopes, getExistingConsent } from '../db/consent'
import type { Redirect } from '@shared/api-response/Redirect'
import { loginUserValidator } from '@shared/api-request/LoginUser'
import appConfig from '../util/config'
import { verifyUserEmailValidator } from '@shared/api-request/VerifyUserEmail'
import { sendEmailVerification } from '../util/email'
import { generate } from 'generate-password'
import type { EmailVerification } from '@shared/db/EmailVerification'
import type { User } from '@shared/db/User'
import { db } from '../db/db'
import { registerUserValidator } from '@shared/api-request/RegisterUser'
import { randomUUID } from 'crypto'
import { REDIRECT_PATHS, TABLES, TTLs } from '@shared/constants'
import { type Interaction } from 'oidc-provider'
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
} from '@simplewebauthn/server'
import {
  deleteAuthenticationOptions, getAuthenticationOptions,
  getPasskey,
  getUserPasskeys,
  saveAuthenticationOptions,
  updatePasskeyCounter,
} from '../db/passkey'
import {
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
import { amrFactors, isExpired, isUnapproved } from '@shared/user'
import { logger } from '../util/logger'
import { argon2 } from '../util/argon2id'
import { zodValidate } from '../util/zodValidate'
import zod from 'zod'
import { passkeyRegistrationValidator } from '../../shared/validators'
import { passwordStrength } from '../util/zxcvbn'
import { checkPrivileged, checkPrivilegedForTotpCreate, checkPrivilegedForTotpValidate } from '../util/authMiddleware'

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
    return
  }
  const { uid, prompt, params } = interaction

  const session = await getSession(req, res)
  const user = req.user

  logger({
    level: 'debug',
    message: `Interaction required`,
    details: {
      interaction: {
        prompt: prompt.name,
        reasons: prompt.reasons,
        client_id: params.client_id,
        proxyauth: params.client_id === 'proxyauth_internal_client',
      },
    },
  })

  if (prompt.name === 'login') {
    // Check for prompt reasons that cause special redirects
    if (prompt.reasons.includes('user_not_approved')) {
      // User is not approved, destroy their session/interaction so they can re-attempt login
      await interaction.destroy()
      if (session) {
        await session.destroy()
      }
      res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.APPROVAL_REQUIRED}`)
      return
    } else if (prompt.reasons.includes('user_expired')) {
      // User is expired, destroy their session/interaction so they can re-attempt login
      // User is not approved, destroy their session/interaction so they can re-attempt login
      await interaction.destroy()
      if (session) {
        await session.destroy()
      }
      res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.USER_EXPIRED}`)
      return
    } else if (prompt.reasons.includes('user_mfa_required')) {
      // User has MFA required, direct them to MFA page
      res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.MFA}`)
      return
    } else if (prompt.reasons.includes('user_email_not_validated')) {
      // User does not have a validated email and needs one
      // Send a verification email if possible
      let verificationSent = false
      if (user && !await getEmailVerification(user.id)) {
        verificationSent = await createEmailVerification(user, null)
      }

      res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.VERIFICATION_EMAIL_SENT}?sent=${verificationSent ? 'true' : 'false'}`)
      return
    }

    res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.LOGIN}`)
    return
  } else if (prompt.name === 'consent') {
    if (prompt.reasons.includes('consent_prompt')) {
      // consent prompt was requested, always comply
      res.redirect(`${appConfig.APP_URL}/consent/${uid}`)
      return
    }

    if (prompt.reasons.includes('client_mfa_required')) {
      // client requires mfa
      res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.MFA}`)
      return
    }

    // Check conditions to skip consent, after provider has already determined it is required
    const { redirect_uri, client_id, scope } = params
    if (typeof redirect_uri === 'string' && typeof client_id === 'string' && typeof scope === 'string') {
      // Check if the client_id is auth_internal_client
      if (client_id === 'auth_internal_client' || client_id === 'proxyauth_internal_client') {
        const grantId = await applyConsent(interaction)
        const redir = await provider.interactionResult(req, res, { consent: { grantId } }, {
          mergeWithLastSubmission: true,
        })
        res.redirect(redir)
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
        return
      }

      // Check if the user has already consented to this client/redirect
      const existingConsent = user?.id && await getExistingConsent(user.id, redirect_uri)
      if (existingConsent && !consentMissingScopes(existingConsent, scope).length) {
        const grantId = await applyConsent(interaction)
        const redir = await provider.interactionResult(req, res, { consent: { grantId } }, {
          mergeWithLastSubmission: true,
        })
        res.redirect(redir)
        return
      }
    }

    res.redirect(`${appConfig.APP_URL}/consent/${uid}`)
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
      clientName: client?.clientName,
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
  zodValidate({
    params: {
      uid: zod.string(),
    },
  }), async (req, res) => {
    const {
      uid,
      prompt,
      params,
      session,
    } = await provider.interactionDetails(req, res)
    const { uid: uidParam } = req.params

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
    return
  })

/**
 *
 * User Registration Routes
 *
 */

/**
 * Register new user with password, finishes login and adds pwd to amr
 */
router.post('/register',
  zodValidate({
    body: {
      ...registerUserValidator,
      password: zod.string(),
    },
  }), async (req, res) => {
    const registration = req.body

    if (passwordStrength(registration.password).score < appConfig.PASSWORD_STRENGTH) {
      res.status(422).send({ message: 'Password is not strong enough.' })
      return
    }

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
      expiresAt: invitation?.userExpiresAt ? new Date(invitation.userExpiresAt) : null,
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
  })

/**
 * Start user registration using a passkey instead of password
 */
router.post('/register/passkey/start',
  zodValidate({
    body: {
      inviteId: zod.string().optional(),
      challenge: zod.string().optional(),
    },
  }), async (req, res) => {
    const invite = req.body

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

    const options = await createPasskeyRegistrationOptions({
      uniqueId: interaction.uid,
    })

    res.send(options)
  })

/**
 * Finish user registration using a passkey instead of password, finishes login and adds webauthn to amr
 */
router.post('/register/passkey/end',
  zodValidate({
    body: {
      ...passkeyRegistrationValidator,
      ...registerUserValidator,
    },
  }), async (req, res) => {
    const registration = req.body

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
      expiresAt: invitation?.userExpiresAt ? new Date(invitation.userExpiresAt) : null,
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

    const addAmr = ['webauthn']
    if (registrationInfo.userVerified) {
      addAmr.push('webauthn_v')
    }

    // See where we need to redirect the user to, depending on config
    const redir = await loginResult(req, res, {
      userId: user.id,
      amr: addAmr,
    })

    res.send(redir)
  })

/**
 *
 * Register AMR Routes
 *
 */

/**
 * Start registering a passkey
 */
router.post('/passkey/registration/start',
  checkPrivileged,
  zodValidate({
    body: {
      requireVerified: zod.boolean().optional(),
    },
  }),
  async (req, res) => {
    // Should only be able to register if fully logged in
    const user = req.user

    if (!user) {
      res.sendStatus(500)
      return
    }

    const userPasskeys = await getUserPasskeys(user.id)

    const options = await createPasskeyRegistrationOptions({
      uniqueId: user.id,
      username: user.username,
      requireVerified: req.body.requireVerified,
      excludeCredentials: userPasskeys,
    })

    res.send(options)
  },
)

/**
 * Finish registering a passkey, finishes login and adds webauthn to amr
 */
router.post('/passkey/registration/end',
  checkPrivileged,
  zodValidate({ body: passkeyRegistrationValidator }),
  async (req, res) => {
    const body = req.body

    // Should only be able to register if fully logged in
    const user = req.user

    if (!user) {
      res.sendStatus(500)
      return
    }

    const { verification, currentOptions } = await getRegistrationInfo(user.id, body)

    const { verified, registrationInfo } = verification
    if (!verified) {
      res.sendStatus(400)
      return
    }

    await createPasskey(user.id, registrationInfo, currentOptions)

    const addAmr = ['webauthn']
    if (registrationInfo.userVerified) {
      addAmr.push('webauthn_v')
    }

    const redir = await loginResult(req, res, {
      userId: user.id,
      amr: addAmr,
    })

    res.send(redir)
  })

/**
 * Register a new totp, needs to be verified afterwards or it expires
 */
router.post('/totp/registration',
  checkPrivilegedForTotpCreate,
  async (req, res) => {
    const user = req.user

    if (!user) {
      res.sendStatus(500)
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
  zodValidate({ body: loginUserValidator }), async (req, res) => {
    const interaction = await getInteractionDetails(req, res)
    const session = await getSession(req, res)
    if (!interaction && !session?.accountId) {
      res.status(419).send({
        message: 'Login page too old, refresh the page.',
      })
      return
    }

    const { input, password, remember } = req.body

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
  })

/**
 * Start login with passkey
 */
router.post('/passkey/start',
  zodValidate({
    body: {
      requireVerified: zod.boolean().optional(),
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

    const userId = interaction?.result?.login?.accountId || session?.accountId
    const passkeys = userId ? await getUserPasskeys(userId) : []

    const options: PublicKeyCredentialRequestOptionsJSON = await generateAuthenticationOptions({
      rpID: passkeyRpId,
      allowCredentials: passkeys,
      userVerification: req.body.requireVerified ? 'required' : 'preferred',
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
  zodValidate({
    body: {
      remember: zod.boolean().optional(),
      id: zod.string(),
      rawId: zod.string(),
      response: zod.object({
        clientDataJSON: zod.string(),
        authenticatorData: zod.string(),
        signature: zod.string(),
        userHandle: zod.string().optional(),
      }),
      authenticatorAttachment: zod.enum(['cross-platform', 'platform']).optional(),
      clientExtensionResults: zod.object({
        appid: zod.boolean().optional(),
        credProps: zod.object({
          rk: zod.boolean().optional(),
        }).optional(),
        hmacCreateSecret: zod.boolean().optional(),
      }),
      type: zod.literal('public-key'),
    },
  }), async (req, res) => {
    const interaction = await getInteractionDetails(req, res)
    const session = await getSession(req, res)
    if (!interaction && !session?.accountId) {
      res.status(419).send({
        message: 'Login page too old, refresh the page.',
      })
      return
    }

    const { remember, ...body } = req.body

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

    const addAmr = ['webauthn']
    if (authenticationInfo.userVerified) {
      addAmr.push('webauthn_v')
    }

    const redir = await loginResult(req, res, {
      userId: user.id,
      amr: addAmr,
      remember,
    })

    res.send(redir)
  })

/**
 * Validate totp and add totp to amr
 */
router.post('/totp',
  checkPrivilegedForTotpValidate,
  zodValidate({
    body: {
      enableMfa: zod.boolean().optional(),
      token: zod.string(),
    },
  }), async (req, res) => {
    const user = req.user

    if (!user) {
      res.sendStatus(500)
      return
    }

    const { token, enableMfa } = req.body

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
  })

/**
 * Verify an email, finishes login adds email to amr
 */
router.post('/verify_email',
  zodValidate({ body: verifyUserEmailValidator }), async (req, res) => {
    const { userId, challenge } = req.body

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

    const emailVerification = await getEmailVerification(userId, challenge)
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
  })

async function loginResult(req: IncomingMessage, res: Response, options: {
  amr: string[]
  userId: string
  remember?: boolean
}): Promise<Redirect | undefined> {
  let { amr } = options
  const { userId, remember = false } = options
  const includesFirstFactorAmr = amrFactors.firstFactors.some(f => amr.includes(f))

  logger({
    level: 'debug',
    message: 'Adding login factor to user',
    details: {
      login: {
        userId,
        amr,
      },
    },
  })

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
      if (interaction.lastSubmission?.login?.accountId === userId) {
        // merge amr if amr is not firstFactor
        if (!includesFirstFactorAmr) {
          amr = [...new Set([...amr, ...(interaction.lastSubmission.login.amr ?? [])])]
        }
      }

      if (interaction.result?.login?.accountId === userId) {
        // merge amr if amr is not firstFactor
        if (!includesFirstFactorAmr) {
          amr = [...new Set([...amr, ...(interaction.result.login.amr ?? [])])]
        }
      }

      return {
        success: true,
        location: await provider.interactionResult(req, res, {
          login: {
            accountId: userId,
            ...(remember ? { remember } : {}), // only include 'remember' in login options if it is true
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
  const scopes = scope.split(/\s+/)
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
  // Do not create an email verification for an unapproved user or expired
  if (isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL) || isExpired(user)) {
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
