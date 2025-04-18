import { Router, type Request, type Response } from "express";
import { provider } from "../oidc/provider";
import { getUserByInput } from "../db/user";
import { addConsent, getConsentScopes, getExistingConsent } from "../db/consent";
import { matchedData } from "express-validator";
import { validate } from "../util/validator";
import type { Redirect } from "@shared/api-response/Redirect";
import type { LoginUser } from "@shared/api-request/LoginUser";
import appConfig from "../util/config";
import type { VerifyUserEmail } from "@shared/api-request/VerifyUserEmail";
import { sendEmailVerification } from "../util/email";
import { generate } from "generate-password";
import type { EmailVerification } from "@shared/db/EmailVerification";
import type { User } from "@shared/db/User";
import { db } from "../db/db";
import type { RegisterUser } from "@shared/api-request/RegisterUser";
import bcrypt from 'bcrypt'
import { randomUUID } from "crypto";
import { REDIRECT_PATHS, TTLs } from "@shared/constants";
import type { Interaction } from "oidc-provider";
import { allowNull, defaultNull, emailValidation, nameValidation, stringValidation, usernameValidation, uuidValidation } from "../util/validators";
import type { ConsentDetails } from "@shared/api-response/ConsentDetails";
import { isExpired, createAudit, createExpiration } from "../db/util";
import type { UserWithoutPassword } from "@shared/api-response/UserDetails";
import { getInvitation } from "../db/invitations";
import type { Invitation } from "@shared/db/Invitation";
import type { Knex } from "knex";
import type { Consent } from "@shared/db/Consent";

const HOUR = 60 * 60; // seconds in an hour

export const router = Router()

// If no interaction found, redirect to homepage for login
router.use(async (req, res, next) => {
  try {
    if (await provider.interactionDetails(req, res)) {
      next()
      return
    }
  } catch (e) {
    // do nothing, no interaction found
  }

  res.redirect(`/`)
})

router.get("/", async (req, res) => {
  const { uid, prompt, params, session } = await provider.interactionDetails(req, res)

  const accountId = session?.accountId

  if (prompt.name === 'login') {
    res.redirect(`/${REDIRECT_PATHS.LOGIN}`)
  } else if (prompt.name === 'consent') {
    // Check conditions to skip consent
    if (typeof params.redirect_uri === "string" && typeof params.scope === "string") {
      // Check if the redirect is to to APP_DOMAIN
      const appUrl = URL.parse(appConfig.APP_DOMAIN)
      const redirectUrl = URL.parse(params.redirect_uri)
      if (appUrl && redirectUrl && 
        appUrl.protocol === redirectUrl.protocol &&
        appUrl.host === redirectUrl.host &&
        appUrl.port === redirectUrl.port) {

        const grantId = await applyConsent(await provider.interactionDetails(req, res))
        await provider.interactionFinished(req, res, { consent: { grantId } }, {
          mergeWithLastSubmission: true,
        })
        return
      }

      // Check if the user has already consented to this client/redirect
      const consent = accountId && await getExistingConsent(accountId, params.redirect_uri)
      if (consent && !consentMissingScopes(consent, params.scope)) {
        const grantId = await applyConsent(await provider.interactionDetails(req, res))
        await provider.interactionFinished(req, res, { consent: { grantId } }, {
          mergeWithLastSubmission: true,
        })
        return
      }
    }

    res.redirect(`/consent/${uid}`)
  } else {
    res.sendStatus(400)
  }
})

router.get("/:uid/detail",
  async (req: Request, res: Response) => {
    const { uid, params } = await provider.interactionDetails(req, res)
    const scope = typeof params?.scope === "string" ? params.scope : ""

    const details: ConsentDetails = {
      uid: uid,
      clientId: params.client_id as string,
      redirectUri: params.redirect_uri as string,
      scopes: scope.split(" "),
    }

    res.send(details)
  }
)

router.post("/login",
  ...validate<LoginUser>({
    input: { 
      ...stringValidation,
      isLength: { options: { min: 4, max: 32 } },
      toLowerCase: true,
    },
    password: stringValidation,
    remember: { isBoolean: true },
  }),
  async (req: Request, res: Response) => {
    const { input, password, remember } = matchedData<LoginUser>(req)
    const {
      prompt: { name },
    } = await provider.interactionDetails(req, res)

    if (name !== 'login') {
      res.sendStatus(400)
      return
    }

    const user = await getUserByInput(input)

    // check user password
    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      res.sendStatus(401)
      return
    }

    const { passwordHash, ...userWithoutPassword } = user

    // check if email verification needed, if not log in
    let redir = await canUserLogin(userWithoutPassword) || {
      location: await provider.interactionResult(req, res, {
        login: {
          accountId: user.id,
          remember: remember
        }
      },
      { mergeWithLastSubmission: false })
    }
    
    res.status(200).send(redir)
    return
  }
)

router.post("/:uid/confirm/",
...validate<{uid: string}>({
  uid: stringValidation,
}),
async (req: Request, res: Response) => {
  const {
    uid,
    prompt,
    params,
    session
  } = await provider.interactionDetails(req, res)
  const { uid: uidParam } = matchedData<{uid: string}>(req)

  if (uid !== uidParam) {
    res.status(400).send({ message: "Consent form is no longer valid." })
    return
  }

  const { name } = prompt

  if (name === 'consent') {
    const grantId = await applyConsent(await provider.interactionDetails(req, res))
    if (typeof params.redirect_uri === "string" && typeof params.scope === "string" && session?.accountId) {
      await addConsent(params.redirect_uri, session.accountId, params.scope)
    }
    await provider.interactionFinished(req, res, { consent: { grantId } }, {
      mergeWithLastSubmission: true,
    })
    return
  } else {
    res.sendStatus(400)
    return
  }
})

router.post('/register',
  ...validate<RegisterUser>({
    username: {
      ...defaultNull,
      ...allowNull,
      optional: true,
      ...usernameValidation
    },
    name: nameValidation,
    email: {
      ...defaultNull,
      ...allowNull,
      optional: true,
      ...emailValidation
    },
    password: {
      ...stringValidation,
      isLength: { options: { min: 8, max: 128 } },
    },
    inviteId: {
      optional: {
        options: {
          values: "null"
        }
      }, ...stringValidation
    },
    challenge: {
      optional: {
        options: {
          values: "null"
        }
      }, ...stringValidation
    }
  }),
  async (req: Request, res: Response) => {
    const trx = await db.transaction()
    try {
      const registration = matchedData<RegisterUser>(req)

      const invitation = registration.inviteId ? await getInvitation(registration.inviteId, trx) : null
      const invitationValid = invitation && 
        !isExpired(invitation.expiresAt) && 
        invitation.challenge === registration.challenge
  
      if (!invitationValid && !appConfig.SIGNUP) {
        res.status(400).send()
        return
      }

      const passwordHash = await bcrypt.hash(registration.password, 10);
  
      const id = randomUUID()
      const { createdAt, updatedAt } = createAudit(id)
      const user: User = {
        id: id,
        username: invitation?.username || registration.username,
        name: invitation?.name || registration.name,
        email: invitation?.email || registration.email,
        passwordHash,
        approved: !!invitationValid, // invited users are approved
        emailVerified: !!invitation?.email, // invited users emails are verified
        createdAt,
        updatedAt,
      }
  
      // check username and email not taken
      let conflictingUser = await getUserByInput(user.username, trx) || (user.email && await getUserByInput(user.email, trx))
  
      if (conflictingUser) {
        let message = conflictingUser.username === user.username || 
          conflictingUser.email === user.username ? "Username taken." : "Email taken."
        res.status(409).send({ message: message })
        return
      }
  
      // insert user into table
      await trx.table<User>('user').insert(user)
  
      if (invitationValid) {
        await trx.table<Invitation>('invitation').delete().where({ id: invitation.id })
      }
  
      const { passwordHash: _passwordHash, ...userWithoutPassword } = user

      const loginRedirect = await canUserLogin(userWithoutPassword, trx)

      trx.commit()

      // See where we need to redirect the user to, depending on config
      const redirect: Redirect = loginRedirect || {
        location: await provider.interactionResult(req, res, {
          accountId: user.id,
          remember: false // non-password logins are never remembered
        })
      }
  
      res.status(200).send(redirect)
    } catch (e) {
      if (!trx.isCompleted()) {
        trx.rollback()
      }
      throw e
    }
  }
)

router.post("/verify_email",
  ...validate<VerifyUserEmail>({
    userId: uuidValidation,
    challenge: stringValidation,
  }),
  async (req: Request, res: Response) => {
    const { userId, challenge } = matchedData<VerifyUserEmail>(req)
    const { uid } = await provider.interactionDetails(req, res)

    const user = await db.select().table<User>("user").where({ id: userId }).first()
    if (!user) {
      res.status(404).send()
      return
    }

    const emailVerification = await getEmailVerification(userId)
    if (!emailVerification) {
      res.status(404).send()
      return
    }

    if (emailVerification.challenge !== challenge) {
      res.status(404).send()
      return
    }

    // TODO: if user email does not match verification email, send an update to the old email
    await db.table<User>('user').where("id", user.id).update({
      emailVerified: true,
      email: emailVerification.email
    })
    await db.delete().table<EmailVerification>("email_verification").where(emailVerification)

    // finish login step, get redirect url to resume interaction
    // If a uid was found, finish the interaction.
    // Otherwise redirect to /login to begin a new interaction flow
    let redir: Redirect = {
      location: await provider.interactionResult(req, res, {
        login: {
          accountId: user.id,
          remember: false // non-password logins are never remembered
        }
      },
      { mergeWithLastSubmission: false })
    }
    
    res.status(200).send(redir)
    return
  }
)

function consentMissingScopes(consent: Consent, scope: string) {
  const scopes = scope.split(",").map(s => s.trim())
  const consentScopes = getConsentScopes(consent)
  return scopes.filter((s) => {
    !consentScopes.includes(s)
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
    grant.addOIDCClaims(details.missingOIDCClaims)
  }
  if (details.missingResourceScopes) {
    for (const [indicator, scopes] of Object.entries(
      details.missingResourceScopes,
    )) {
      grant.addResourceScope(indicator, (scopes as any).join(' '))
    }
  }

  const grantId = await grant.save()
  return grantId
}

async function canUserLogin(user: UserWithoutPassword, trx?: Knex.Transaction) {
  return await isUserUnapproved(user) || await isUserEmailUnverified(user, trx)
}

async function isUserUnapproved(user: UserWithoutPassword) {
  if (appConfig.SIGNUP_REQUIRES_APPROVAL && !user.approved) {
    const redirect: Redirect = {
      location: `/${REDIRECT_PATHS.APPROVAL_REQUIRED}`
    }
    return redirect
  }
}

async function isUserEmailUnverified(user: UserWithoutPassword, trx?: Knex.Transaction) {
  if (appConfig.EMAIL_VERIFICATION && !user.emailVerified) {
    if (!await getEmailVerification(user.id, trx)) {
      await createEmailVerification(user, null, trx)
    }
    
    const redirect: Redirect = {
      location: `/${REDIRECT_PATHS.VERIFICATION_EMAIL_SENT}/${user.id}?sent=true`
    }
    return redirect
  }
}

/**
 * 
 * @param user the user that will be verified
 * @param options.uid the interaction id that will automatically log the user in if they verify on the same device
 * @param options.email the users new email. If not set, verifies the users existing email
 * @returns 
 */
export async function createEmailVerification(user: UserWithoutPassword, email?: string | null, trx?: Knex.Transaction) {
  // Do not create an email verification for an unapproved user
  if (await isUserUnapproved(user)) {
    return false
  }

  const q = trx ?? db

  const sentEmail = email ?? user.email
  if (!sentEmail) {
    return false
  }

  // generate email verification challenge
  const challenge = generate({
    length: 32,
    numbers: true
  })
  let email_verification: EmailVerification = {
    userId: user.id,
    email: sentEmail,
    challenge: challenge,
    expiresAt: createExpiration(TTLs.VERIFICATION_EMAIL),
    ...createAudit(user.id)
  }
  // invalidate old email verification challenges
  await q.delete().table<EmailVerification>('email_verification').where('userId', user.id)
  // insert new email verification challenge
  await q.table<EmailVerification>('email_verification').insert(email_verification)
  await sendEmailVerification(user, challenge, sentEmail)
  return true
}

export async function getEmailVerification(userId: string, trx?: Knex.Transaction) {
  const q = trx ?? db
  const emailVerification = await q.select()
    .table<EmailVerification>("email_verification")
    .where({ userId }).first()

  if (emailVerification && !isExpired(emailVerification.expiresAt)) {
    return emailVerification
  }
}
