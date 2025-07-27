import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { Router, type Request, type Response } from 'express'
import appConfig from '../util/config'
import { sendPasswordReset, SMTP_VERIFIED } from '../util/email'
import type { PasswordReset } from '@shared/db/PasswordReset'
import { validate } from '../util/validate'
import { newPasswordValidation, stringValidation, uuidValidation } from '../util/validators'
import { matchedData } from 'express-validator'
import { getUserById, getUserByInput } from '../db/user'
import { db } from '../db/db'
import { createExpiration } from '../db/util'
import { TTLs } from '@shared/constants'
import type { SendPasswordResetResponse } from '@shared/api-response/SendPasswordResetResponse'
import { randomUUID } from 'crypto'
import type { ResetPassword } from '@shared/api-request/ResetPassword'
import type { User } from '@shared/db/User'
import * as argon2 from 'argon2'
import { generate } from 'generate-password'

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
    emailVerification: appConfig.EMAIL_VERIFICATION,
    registration: appConfig.SIGNUP,
    contactEmail: appConfig.CONTACT_EMAIL,
    defaultRedirect: appConfig.DEFAULT_REDIRECT,
  }

  res.send(configResponse)
})

publicRouter.post('/send_password_reset',
  ...validate<{ input: string }>({
    input: stringValidation,
  }),
  async (req: Request, res: Response) => {
    const { input } = matchedData<{ input: string }>(req, { includeOptionals: true })
    const user = await getUserByInput(input)

    if (!user) {
      res.sendStatus(404)
      return
    }

    const passwordReset: PasswordReset = {
      id: randomUUID(),
      userId: user.id,
      challenge: generate({
        length: 32,
        numbers: true,
      }),
      createdAt: new Date(),
      expiresAt: createExpiration(TTLs.PASSWORD_RESET),
    }
    await db().table<PasswordReset>('password_reset').insert(passwordReset)

    // If possible, send email
    const email = user.email
    const result: SendPasswordResetResponse = { emailSent: false }
    if (email && SMTP_VERIFIED) {
      const { passwordHash, ...userWithoutPassword } = user
      await sendPasswordReset(passwordReset, userWithoutPassword, email)
      result.emailSent = true
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
  async (req: Request, res: Response) => {
    const { userId, challenge, newPassword } = matchedData<ResetPassword>(req, { includeOptionals: true })
    const user = await getUserById(userId)
    const passwordReset = await db().select().table<PasswordReset>('password_reset')
      .where({ userId, challenge }).andWhere('expiresAt', '>=', new Date()).first()

    if (!user || !passwordReset) {
      res.sendStatus(400)
      return
    }

    await db().table<User>('user').update({ passwordHash: await argon2.hash(newPassword) }).where({ id: user.id })
    await db().table<PasswordReset>('password_reset').delete().where({ id: passwordReset.id })
    res.send()
  },
)
