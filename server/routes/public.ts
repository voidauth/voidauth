import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { Router } from 'express'
import appConfig from '../util/config'
import { sendPasswordReset, SMTP_VERIFIED } from '../util/email'
import type { PasswordReset } from '@shared/db/PasswordReset'
import { validate, validatorData } from '../util/validate'
import { newPasswordValidation, stringValidation, uuidValidation } from '../util/validators'
import { endSessions, getUserById, getUserByInput } from '../db/user'
import { db } from '../db/db'
import { TABLES } from '@shared/constants'
import type { SendPasswordResetResponse } from '@shared/api-response/SendPasswordResetResponse'
import type { ResetPassword } from '@shared/api-request/ResetPassword'
import type { User } from '@shared/db/User'
import { createPasskey, createPasskeyRegistrationOptions, getRegistrationInfo, passkeyRegistrationValidator } from '../util/passkey'
import { getUserPasskeys } from '../db/passkey'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { passwordStrength } from '../util/zxcvbn'
import { logger } from '../util/logger'
import { argon2 } from '../util/argon2id'
import { createPasswordReset } from '../db/passwordReset'

/**
 * routes that do not require any auth
 */
export const publicRouter = Router()

publicRouter.get('/config', (_req, res) => {
  const configResponse: ConfigResponse = {
    domain: appConfig.APP_URL,
    appName: appConfig.APP_TITLE,
    zxcvbnMin: appConfig.PASSWORD_STRENGTH,
    emailActive: SMTP_VERIFIED,
    emailVerification: !!appConfig.EMAIL_VERIFICATION,
    signupRequiresApproval: appConfig.SIGNUP_REQUIRES_APPROVAL,
    registration: appConfig.SIGNUP,
    contactEmail: appConfig.CONTACT_EMAIL,
    defaultRedirect: appConfig.DEFAULT_REDIRECT,
    mfaRequired: appConfig.MFA_REQUIRED,
  }

  res.send(configResponse)
})

publicRouter.post('/passwordStrength',
  ...validate<{ password: string }>({
    password: stringValidation,
  }),
  (req, res) => {
    const { password } = validatorData<{ password: string }>(req)
    res.send(passwordStrength(password))
  },
)

publicRouter.post('/send_password_reset',
  ...validate<{ input: string }>({
    input: stringValidation,
  }),
  async (req, res) => {
    const { input } = validatorData<{ input: string }>(req)
    const user = await getUserByInput(input)

    if (!user) {
      res.sendStatus(404)
      return
    }

    // Create the password reset link even if email will not send
    const passwordReset = await createPasswordReset(user.id)

    // If possible, send email
    const result: SendPasswordResetResponse = { emailSent: false }
    try {
      const email = user.email
      if (email && SMTP_VERIFIED && (!appConfig.EMAIL_VERIFICATION || user.emailVerified)) {
        await sendPasswordReset(passwordReset, user, email)
        result.emailSent = true
      }
    } catch (e) {
      logger.error(e)
    }

    res.send(result)
  },
)

publicRouter.post('/reset_password',
  ...validate<ResetPassword>({
    userId: uuidValidation,
    challenge: stringValidation,
    newPassword: newPasswordValidation,
  }),
  async (req, res) => {
    const { userId, challenge, newPassword } = validatorData<ResetPassword>(req)
    const user = await getUserById(userId)
    const passwordReset = await db().select().table<PasswordReset>(TABLES.PASSWORD_RESET)
      .where({ userId, challenge }).andWhere('expiresAt', '>=', new Date()).first()

    if (!user || !passwordReset) {
      res.sendStatus(400)
      return
    }

    await db().table<User>(TABLES.USER).update({ passwordHash: argon2.hash(newPassword) }).where({ id: user.id })
    await db().table<PasswordReset>(TABLES.PASSWORD_RESET).delete().where({ id: passwordReset.id })
    await endSessions(user.id)
    res.send()
  },
)

publicRouter.post('/reset_password/passkey/start',
  ...validate<Omit<ResetPassword, 'newPassword'>>({
    userId: uuidValidation,
    challenge: stringValidation,
  }),
  async (req, res) => {
    const { userId, challenge } = validatorData<Omit<ResetPassword, 'newPassword'>>(req)
    const user = await getUserById(userId)
    const passwordReset = await db().select().table<PasswordReset>(TABLES.PASSWORD_RESET)
      .where({ userId, challenge }).andWhere('expiresAt', '>=', new Date()).first()

    if (!user || !passwordReset) {
      res.sendStatus(400)
      return
    }

    const userPasskeys = await getUserPasskeys(user.id)

    const options = await createPasskeyRegistrationOptions(user.id, user.username, userPasskeys)

    res.send(options)
  },
)

publicRouter.post('/reset_password/passkey/end',
  ...validate<Omit<ResetPassword, 'newPassword'> & RegistrationResponseJSON>({
    userId: uuidValidation,
    challenge: stringValidation,
    ...passkeyRegistrationValidator,
  }),
  async (req, res) => {
    const body = validatorData<Omit<ResetPassword, 'newPassword'> & RegistrationResponseJSON>(req)
    const { userId, challenge } = body
    const user = await getUserById(userId)
    const passwordReset = await db().select().table<PasswordReset>(TABLES.PASSWORD_RESET)
      .where({ userId, challenge }).andWhere('expiresAt', '>=', new Date()).first()

    if (!user || !passwordReset) {
      res.sendStatus(400)
      return
    }

    await db().table<PasswordReset>(TABLES.PASSWORD_RESET).delete().where({ id: passwordReset.id })

    const { verification, currentOptions } = await getRegistrationInfo(user.id, body)

    const { verified, registrationInfo } = verification
    if (!verified) {
      res.sendStatus(400)
      return
    }

    await createPasskey(user.id, registrationInfo, currentOptions)

    res.send()
  },
)
