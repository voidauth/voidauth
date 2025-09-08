import { Router, type Request, type Response } from 'express'
import { provider } from '../oidc/provider'
import { checkPasswordHash, getUserById, getUserByInput, isUnapproved, isUnverified } from '../db/user'
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
import * as argon2 from 'argon2'
import { randomUUID } from 'crypto'
import { REDIRECT_PATHS, TTLs } from '@shared/constants'
import { type Interaction, type Session } from 'oidc-provider'
import { unlessNull, emailValidation, nameValidation,
  newPasswordValidation,
  stringValidation, usernameValidation, uuidValidation } from '../util/validators'
import type { ConsentDetails } from '@shared/api-response/ConsentDetails'
import { createExpiration } from '../db/util'
import { getInvitation } from '../db/invitations'
import type { Invitation } from '@shared/db/Invitation'
import type { Consent } from '@shared/db/Consent'
import { type OIDCExtraParams, oidcLoginPath } from '@shared/oidc'
import { getClient } from '../db/client'
import type { InvitationGroup, UserGroup } from '@shared/db/Group'
import { generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON } from '@simplewebauthn/server'
import { deleteAuthenticationOptions, getAuthenticationOptions,
  getPasskey,
  getUserPasskeys,
  saveAuthenticationOptions,
  updatePasskeyCounter } from '../db/passkey'
import { passkeyRegistrationValidator,
  passkeyRpId,
  passkeyRpOrigin,
  createPasskeyRegistrationOptions,
  getRegistrationInfo,
  createPasskey } from '../util/passkey'
import type { CurrentUserDetails, UserDetails } from '@shared/api-response/UserDetails'
import { getEmailVerification } from '../db/emailVerification'

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
  res.send(redir)
})

router.get('/', async (req, res) => {
  const interaction = await getInteractionDetails(req, res)
  if (!interaction) {
    res.redirect(`${appConfig.APP_URL}/`)
    return
  }
  const { uid, prompt, params } = interaction

  // if we get here and user is blocked, remove the session and restart the flow
  const ctx = provider.createContext(req, res)
  const session = await provider.Session.get(ctx) as Session | undefined
  const accountId = session?.accountId
  if (accountId) {
    const user = await getUserById(accountId)
    if (user) {
      const redir = await userNeedsRedirect(user)
      if (redir) {
        await session.destroy()
        res.redirect(redir.location)
        return
      }
    }
  }

  if (prompt.name === 'login') {
    // Determine which 'login' type page to redirect to
    const extraParams: OIDCExtraParams = params as OIDCExtraParams
    switch (extraParams.login_type) {
      case 'register':
        if (params.login_id) {
          res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.INVITE}?invite=${extraParams.login_id}&challenge=${extraParams.login_challenge}`)
        } else {
          res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.REGISTER}`)
        }
        return

      case 'verify_email':
        res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.VERIFY_EMAIL}/${extraParams.login_id}/${extraParams.login_challenge}`)
        return

      case 'login':
      default:
        res.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.LOGIN}`)
        return
    }
  } else if (prompt.name === 'consent') {
    // Check conditions to skip consent
    const { redirect_uri, client_id, scope } = params
    if (typeof redirect_uri === 'string' && typeof client_id === 'string' && typeof scope === 'string') {
      // Check if the client_id is auth_internal_client
      if (client_id === 'auth_internal_client') {
        const grantId = await applyConsent(interaction)
        await provider.interactionResult(req, res, { consent: { grantId } }, {
          mergeWithLastSubmission: true,
        })
        // manually set redirect location for auth_internal_client
        res.redirect(redirect_uri)
        return
      }

      // Check if client.skip_consent
      const client = await getClient(client_id)
      if (client?.skip_consent) {
        const grantId = await applyConsent(interaction)
        await provider.interactionFinished(req, res, { consent: { grantId } }, {
          mergeWithLastSubmission: true,
        })
        return
      }

      // Check if the user has already consented to this client/redirect
      const consent = accountId && await getExistingConsent(accountId, redirect_uri)
      if (consent && !consentMissingScopes(consent, scope).length) {
        const grantId = await applyConsent(interaction)
        await provider.interactionFinished(req, res, { consent: { grantId } }, {
          mergeWithLastSubmission: true,
        })
        return
      }
    }

    res.redirect(`${appConfig.APP_URL}/consent/${uid}`)
  } else {
    res.sendStatus(400)
  }
})

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

router.post('/login',
  ...validate<LoginUser>({
    input: {
      ...stringValidation,
      isLength: { options: { min: 4, max: 32 } },
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
    if (!interaction) {
      res.status(419).send({
        message: 'Login page too old, refresh the page.',
      })
      return
    }
    const { prompt: { name } } = interaction

    const { input, password, remember } = validatorData<LoginUser>(req)

    if (name !== 'login') {
      res.sendStatus(400)
      return
    }

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
    const redir: Redirect = await userNeedsRedirect(user) || {
      success: true,
      location: await provider.interactionResult(req, res, {
        login: {
          accountId: user.id,
          remember: remember,
          amr: ['pwd'],
        },
      },
      { mergeWithLastSubmission: true }),
    }

    res.send(redir)
  },
)

router.post('/passkey/start',
  async (req, res) => {
    const interaction = await getInteractionDetails(req, res)
    if (!interaction) {
      res.status(419).send({
        message: 'Login page too old, refresh the page.',
      })
      return
    }
    const { prompt: { name } } = interaction

    if (name !== 'login') {
      res.sendStatus(400)
      return
    }

    const options: PublicKeyCredentialRequestOptionsJSON = await generateAuthenticationOptions({
      rpID: passkeyRpId,
      allowCredentials: [],
    })

    // (Pseudocode) Remember this challenge for this user
    await saveAuthenticationOptions(interaction.uid, options)

    res.send(options)
    return
  },
)

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
    if (!interaction) {
      res.status(419).send({
        message: 'Login page too old, refresh the page.',
      })
      return
    }
    const { prompt: { name } } = interaction

    const body = validatorData<AuthenticationResponseJSON>(req)

    if (name !== 'login') {
      res.sendStatus(400)
      return
    }

    const authOptions = await getAuthenticationOptions(interaction.uid)

    if (!authOptions) {
      res.sendStatus(404)
      return
    }

    await deleteAuthenticationOptions(interaction.uid)

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

    // check if email verification needed, if not log in
    const redir: Redirect = await userNeedsRedirect(user) || {
      success: true,
      location: await provider.interactionResult(req, res, {
        login: {
          accountId: user.id,
          remember: false,
          amr: ['webauthn'],
        },
      },
      { mergeWithLastSubmission: true }),
    }

    res.send(redir)
  },
)

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
    await provider.interactionFinished(req, res, { consent: { grantId } }, {
      mergeWithLastSubmission: true,
    })
  },
)

router.post('/register',
  ...validate<RegisterUser>({
    ...registerUserValidator,
    password: newPasswordValidation,
  }),
  async (req, res) => {
    const registration = validatorData<RegisterUser>(req)
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

    const passwordHash = await argon2.hash(registration.password)

    const id = randomUUID()
    const user: User = {
      id: id,
      username: invitation?.username || registration.username,
      name: invitation?.name || registration.name,
      email: invitation?.email || registration.email,
      passwordHash,
      approved: !!invitationValid, // invited users are approved by default
      emailVerified: !!invitation?.email && invitation.emailVerified,
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
    await db().table<User>('user').insert(user)

    if (invitationValid) {
      const inviteGroups = await db().select().table<InvitationGroup>('invitation_group')
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
        await db().table<UserGroup>('user_group').insert(userGroups)
      }

      await db().table<Invitation>('invitation').delete().where({ id: invitation.id })

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

    const loginRedirect = await userNeedsRedirect(createdUser)

    // See where we need to redirect the user to, depending on config
    const redirect: Redirect = loginRedirect || {
      success: true,
      location: await provider.interactionResult(req, res, {
        login: {
          accountId: user.id,
          remember: false, // non-password logins are never remembered
          amr: ['pwd'],
        },
      }, { mergeWithLastSubmission: true }),
    }

    res.send(redirect)
  },
)

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
      res.status(419).send({
        message: `Page too old, refresh the page.`,
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

router.post('/register/passkey/end',
  ...validate<RegistrationResponseJSON & Omit<RegisterUser, 'password'>>({
    ...passkeyRegistrationValidator,
    ...registerUserValidator,
  }),
  async (req, res) => {
    const registration = validatorData<RegistrationResponseJSON & Omit<RegisterUser, 'password'>>(req)

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
    if (!verified || !registrationInfo) {
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
    await db().table<User>('user').insert(user)

    if (invitationValid) {
      const inviteGroups = await db().select().table<InvitationGroup>('invitation_group')
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
        await db().table<UserGroup>('user_group').insert(userGroups)
      }

      await db().table<Invitation>('invitation').delete().where({ id: invitation.id })

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

    const loginRedirect = await userNeedsRedirect(createdUser)

    // See where we need to redirect the user to, depending on config
    const redirect: Redirect = loginRedirect || {
      success: true,
      location: await provider.interactionResult(req, res, {
        login: {
          accountId: createdUser.id,
          remember: false, // non-password logins are never remembered
          amr: ['webauthn'],
        },
      }, { mergeWithLastSubmission: true }),
    }

    res.send(redirect)
  },
)

router.post('/passkey/registration/start',
  async (req, res) => {
    // user could actually be missing here since we are not checking with middleware before this
    let user: UserDetails | undefined = req.user as CurrentUserDetails | undefined

    if (!user) {
      const accountId = (await getInteractionDetails(req, res))?.result?.login?.accountId
      if (accountId) {
        user = await getUserById(accountId)
      }
    }

    if (!user) {
      res.sendStatus(401)
      return
    }

    const userPasskeys = await getUserPasskeys(user.id)

    const options = await createPasskeyRegistrationOptions(user.id, user.username, userPasskeys)

    res.send(options)
  },
)

router.post('/passkey/registration/end',
  ...validate<RegistrationResponseJSON>(passkeyRegistrationValidator),
  async (req, res) => {
    const body = validatorData<RegistrationResponseJSON>(req)

    // Retrieve the logged-in user
    // user could actually be missing here since we are not checking with middleware before this
    let user: UserDetails | undefined = req.user as CurrentUserDetails | undefined

    if (!user) {
      const accountId = (await getInteractionDetails(req, res))?.result?.login?.accountId
      if (accountId) {
        user = await getUserById(accountId)
      }
    }

    if (!user) {
      res.sendStatus(401)
      return
    }

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

    // Try to add webauthn to interaction amr
    try {
      const interaction = await getInteractionDetails(req, res)
      if (interaction?.result?.login?.accountId && !interaction.result.login.amr?.includes('webauthn')) {
        const amr = interaction.result.login.amr ?? []
        amr.push('webauthn')
        interaction.result.login.amr = amr
        await interaction.save(TTLs.INTERACTION)
      }
    } catch (e) {
      console.error(e)
    }

    res.send()
  },
)

router.post('/verify_email',
  ...validate<VerifyUserEmail>({
    userId: uuidValidation,
    challenge: stringValidation,
  }),
  async (req, res) => {
    const { userId, challenge } = validatorData<VerifyUserEmail>(req)

    const interaction = await getInteractionDetails(req, res)
    if (!interaction) {
      const redir: Redirect = {
        success: false,
        location: oidcLoginPath(appConfig.APP_URL + '/api/cb', 'verify_email', userId, challenge),
      }
      res.send(redir)
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
    await db().table<User>('user').where('id', user.id).update({
      emailVerified: true,
      email: emailVerification.email,
    })
    await db().delete().table<EmailVerification>('email_verification').where(emailVerification)

    // Email verification should redirect to DEFAULT_REDIRECT if set
    const defaultRedirect = appConfig.DEFAULT_REDIRECT
    if (defaultRedirect) {
      interaction.params.redirect_uri = defaultRedirect
      await interaction.save(TTLs.INTERACTION)
    }

    // finish login step, get redirect url to resume interaction
    // If a uid was found, finish the interaction.
    // Otherwise redirect to /login to begin a new interaction flow
    const redir: Redirect = {
      success: true,
      location: await provider.interactionResult(req, res, {
        login: {
          accountId: user.id,
          remember: false, // non-password logins are never remembered
          amr: ['email'],
        },
      },
      { mergeWithLastSubmission: true }),
    }

    res.send(redir)
    return
  },
)

async function getInteractionDetails(req: Request, res: Response) {
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

async function userNeedsRedirect(user: UserDetails) {
  return isUserUnapproved(user) || await isUserEmailUnverified(user)
}

function isUserUnapproved(user: UserDetails) {
  if (isUnapproved(user)) {
    const redirect: Redirect = {
      success: false,
      location: `${appConfig.APP_URL}/${REDIRECT_PATHS.APPROVAL_REQUIRED}`,
    }
    return redirect
  }
}

async function isUserEmailUnverified(user: UserDetails) {
  let verificationSent = false
  if (isUnverified(user)) {
    if (!await getEmailVerification(user.id)) {
      verificationSent = await createEmailVerification(user, null)
    }

    const redirect: Redirect = {
      success: false,
      location: `${appConfig.APP_URL}/${REDIRECT_PATHS.VERIFICATION_EMAIL_SENT}/${user.id}?sent=${verificationSent ? 'true' : 'false'}`,
    }
    return redirect
  }
}

export async function createEmailVerification(
  user: UserDetails,
  email?: string | null) {
  // Do not create an email verification for an unapproved user
  if (isUserUnapproved(user)) {
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
  await db().table<EmailVerification>('email_verification').insert(email_verification)
  await sendEmailVerification(user, challenge, sentEmail)
  return true
}
