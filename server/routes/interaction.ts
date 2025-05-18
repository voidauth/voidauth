import { Router, type Request, type Response } from "express"
import { provider } from "../oidc/provider"
import { getUserByInput } from "../db/user"
import { addConsent, getConsentScopes, getExistingConsent } from "../db/consent"
import { matchedData } from "express-validator"
import { validate } from "../util/validate"
import type { Redirect } from "@shared/api-response/Redirect"
import type { LoginUser } from "@shared/api-request/LoginUser"
import appConfig from "../util/config"
import type { VerifyUserEmail } from "@shared/api-request/VerifyUserEmail"
import { sendEmailVerification } from "../util/email"
import { generate } from "generate-password"
import type { EmailVerification } from "@shared/db/EmailVerification"
import type { User } from "@shared/db/User"
import { commit, createTransaction, db, rollback } from "../db/db"
import type { RegisterUser } from "@shared/api-request/RegisterUser"
import * as argon2 from "argon2"
import { randomUUID } from "crypto"
import { REDIRECT_PATHS, TTLs } from "@shared/constants"
import type { Interaction } from "oidc-provider"
import { emailValidation, nameValidation,
  newPasswordValidation,
  optionalNull,
  stringValidation, usernameValidation, uuidValidation } from "../util/validators"
import type { ConsentDetails } from "@shared/api-response/ConsentDetails"
import { createExpiration } from "../db/util"
import type { UserWithoutPassword } from "@shared/api-response/UserDetails"
import { getInvitation } from "../db/invitations"
import type { Invitation } from "@shared/db/Invitation"
import type { Consent } from "@shared/db/Consent"
import { type OIDCExtraParams, oidcLoginPath } from "@shared/oidc"
import { getClient } from "../db/client"

export const router = Router()

router.get("/exists", async (req, res) => {
  if (await getInteractionDetails(req, res)) {
    res.send()
    return
  }

  res.sendStatus(404)
})

router.get("/", async (req, res) => {
  const interaction = await getInteractionDetails(req, res)
  if (!interaction) {
    res.redirect("/")
    return
  }
  const { uid, prompt, params, session } = interaction

  const accountId = session?.accountId

  if (prompt.name === "login") {
    // Determine which 'login' type page to redirect to
    const extraParams: OIDCExtraParams = params as OIDCExtraParams
    switch (extraParams.login_type) {
      case "register":
        if (params.login_id) {
          res.redirect(`/${REDIRECT_PATHS.INVITE}?invite=${extraParams.login_id}&challenge=${extraParams.login_challenge}`)
        } else {
          res.redirect(`/${REDIRECT_PATHS.REGISTER}`)
        }
        return

      case "verify_email":
        res.redirect(`/${REDIRECT_PATHS.VERIFY_EMAIL}/${extraParams.login_id}/${extraParams.login_challenge}`)
        return

      case "login":
      default:
        res.redirect(`/${REDIRECT_PATHS.LOGIN}`)
        return
    }
  } else if (prompt.name === "consent") {
    // Check conditions to skip consent
    const { redirect_uri, client_id, scope } = params
    if (typeof redirect_uri === "string" && typeof client_id === "string" && typeof scope === "string") {
      // Check if the redirect is to to APP_DOMAIN
      const appUrl = URL.parse(appConfig.APP_DOMAIN)
      const redirectUrl = URL.parse(redirect_uri)
      if (appUrl && redirectUrl
        && appUrl.protocol === redirectUrl.protocol
        && appUrl.host === redirectUrl.host
        && appUrl.port === redirectUrl.port) {
        const grantId = await applyConsent(interaction)
        await provider.interactionFinished(req, res, { consent: { grantId } }, {
          mergeWithLastSubmission: true,
        })
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

    res.redirect(`/consent/${uid}`)
  } else {
    res.sendStatus(400)
  }
})

router.get("/:uid/detail",
  async (req: Request, res: Response) => {
    const interaction = await getInteractionDetails(req, res)
    if (!interaction) {
      res.sendStatus(400)
      return
    }
    const { uid, params } = interaction
    const scope = typeof params.scope === "string" ? params.scope : ""
    const client = await provider.Client.find(params.client_id as string)
    const details: ConsentDetails = {
      uid: uid,
      clientId: params.client_id as string,
      logoUri: client?.logoUri,
      redirectUri: params.redirect_uri as string,
      scopes: scope.split(" "),
    }

    res.send(details)
  },
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
    const interaction = await getInteractionDetails(req, res)
    if (!interaction) {
      res.status(400).send({
        message: "Login page too old, refresh the page.",
      })
      return
    }
    const { prompt: { name } } = interaction

    const { input, password, remember } = matchedData<LoginUser>(req)

    if (name !== "login") {
      res.sendStatus(400)
      return
    }

    const user = await getUserByInput(input)

    // check user password
    if (!user || !await argon2.verify(user.passwordHash, password)) {
      res.sendStatus(401)
      return
    }

    const { passwordHash, ...userWithoutPassword } = user

    // check if email verification needed, if not log in
    const redir = await canUserLogin(userWithoutPassword) || {
      location: await provider.interactionResult(req, res, {
        login: {
          accountId: user.id,
          remember: remember,
          amr: ["pwd"],
        },
      },
      { mergeWithLastSubmission: true }),
    }

    res.send(redir)
  },
)

router.post("/:uid/confirm/",
  ...validate<{ uid: string }>({
    uid: stringValidation,
  }),
  async (req: Request, res: Response) => {
    const {
      uid,
      prompt,
      params,
      session,
    } = await provider.interactionDetails(req, res)
    const { uid: uidParam } = matchedData<{ uid: string }>(req)

    if (uid !== uidParam) {
      res.status(400).send({ message: "Consent form is no longer valid." })
      return
    }

    if (prompt.name !== "consent") {
      res.sendStatus(400)
      return
    }

    const grantId = await applyConsent(await provider.interactionDetails(req, res))
    if (typeof params.redirect_uri === "string" && typeof params.scope === "string" && session?.accountId) {
      await addConsent(params.redirect_uri, session.accountId, params.scope)
    }
    await provider.interactionFinished(req, res, { consent: { grantId } }, {
      mergeWithLastSubmission: true,
    })
  },
)

router.post("/register",
  ...validate<RegisterUser>({
    username: {
      default: {
        options: null,
      },
      ...optionalNull,
      ...usernameValidation,
    },
    name: nameValidation,
    email: {
      default: {
        options: null,
      },
      optional: {
        options: {
          values: "null",
        },
      },
      ...emailValidation,
    },
    password: newPasswordValidation,
    inviteId: {
      optional: {
        options: {
          values: "null",
        },
      },
      ...stringValidation,
    },
    challenge: {
      optional: {
        options: {
          values: "null",
        },
      },
      ...stringValidation,
    },
  }),
  async (req: Request, res: Response) => {
    await createTransaction()
    try {
      const registration = matchedData<RegisterUser>(req)

      if (!await getInteractionDetails(req, res)) {
        const action = registration.inviteId ? "Invite" : "Registration"
        res.status(400).send({
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
        emailVerified: !!(invitation?.email || registration.email) && invitation?.emailVerified,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // check username and email not taken
      const conflictingUser = await getUserByInput(user.username)
        || (user.email && await getUserByInput(user.email))

      if (conflictingUser) {
        const message = conflictingUser.username === user.username
          || conflictingUser.email === user.username
          ? "Username taken."
          : "Email taken."
        res.status(409).send({ message: message })
        return
      }

      // insert user into table
      await db().table<User>("user").insert(user)

      if (invitationValid) {
        await db().table<Invitation>("invitation").delete().where({ id: invitation.id })
      }

      const { passwordHash: _passwordHash, ...userWithoutPassword } = user

      const loginRedirect = await canUserLogin(userWithoutPassword)

      await commit()

      // See where we need to redirect the user to, depending on config
      const redirect: Redirect = loginRedirect || {
        location: await provider.interactionResult(req, res, {
          accountId: user.id,
          remember: false, // non-password logins are never remembered
          amr: [],
        }, { mergeWithLastSubmission: true }),
      }

      res.send(redirect)
    } catch (e) {
      await rollback()
      throw e
    }
  },
)

router.post("/verify_email",
  ...validate<VerifyUserEmail>({
    userId: uuidValidation,
    challenge: stringValidation,
  }),
  async (req: Request, res: Response) => {
    const { userId, challenge } = matchedData<VerifyUserEmail>(req)

    if (!await getInteractionDetails(req, res)) {
      const redir: Redirect = {
        location: oidcLoginPath(appConfig.APP_DOMAIN, "verify_email", userId, challenge),
      }
      res.send(redir)
      return
    }

    const user = await db().select().table<User>("user").where({ id: userId }).first()
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
    await db().table<User>("user").where("id", user.id).update({
      emailVerified: true,
      email: emailVerification.email,
    })
    await db().delete().table<EmailVerification>("email_verification").where(emailVerification)

    // finish login step, get redirect url to resume interaction
    // If a uid was found, finish the interaction.
    // Otherwise redirect to /login to begin a new interaction flow
    const redir: Redirect = {
      location: await provider.interactionResult(req, res, {
        login: {
          accountId: user.id,
          remember: false, // non-password logins are never remembered
          amr: ["email"],
        },
      },
      { mergeWithLastSubmission: false }),
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
  const scopes = scope.split(",").map(s => s.trim())
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
    grant.addOIDCScope(details.missingOIDCScope.join(" "))
  }
  if (details.missingOIDCClaims instanceof Array) {
    grant.addOIDCClaims(details.missingOIDCClaims as string[])
  }
  if (details.missingResourceScopes) {
    for (const [indicator, scopes] of Object.entries(
      details.missingResourceScopes,
    )) {
      grant.addResourceScope(indicator, (scopes as string[]).join(" "))
    }
  }

  const grantId = await grant.save()
  return grantId
}

async function canUserLogin(user: UserWithoutPassword) {
  return isUserUnapproved(user) || await isUserEmailUnverified(user)
}

function isUserUnapproved(user: UserWithoutPassword) {
  if (appConfig.SIGNUP_REQUIRES_APPROVAL && !user.approved) {
    const redirect: Redirect = {
      location: `/${REDIRECT_PATHS.APPROVAL_REQUIRED}`,
    }
    return redirect
  }
}

async function isUserEmailUnverified(user: UserWithoutPassword) {
  if (appConfig.EMAIL_VERIFICATION && !user.emailVerified) {
    if (!await getEmailVerification(user.id)) {
      await createEmailVerification(user, null)
    }

    const redirect: Redirect = {
      location: `/${REDIRECT_PATHS.VERIFICATION_EMAIL_SENT}/${user.id}?sent=true`,
    }
    return redirect
  }
}

export async function createEmailVerification(
  user: UserWithoutPassword,
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
  await db().table<EmailVerification>("email_verification").insert(email_verification)
  await sendEmailVerification(user, challenge, sentEmail)
  return true
}

export async function getEmailVerification(userId: string) {
  const emailVerification = await db().select()
    .table<EmailVerification>("email_verification")
    .where({ userId }).andWhere("expiresAt", ">=", new Date()).first()

  if (emailVerification) {
    return emailVerification
  }
}
