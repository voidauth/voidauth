import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { Router, type Request, type Response } from 'express'
import appConfig from '../util/config'
import { sendPasswordReset, SMTP_VERIFIED } from '../util/email'
import type { PasswordReset } from '@shared/db/PasswordReset'
import { validate } from '../util/validate'
import { stringValidation } from '../util/validators'
import { matchedData } from 'express-validator'
import { getUserByInput } from '../db/user'
import { nanoid } from 'nanoid'
import { db } from '../db/db'
import { createExpiration } from '../db/util'
import { TTLs } from '@shared/constants'
import type { SendPasswordResetResponse } from '@shared/api-response/SendPasswordResetResponse'

/**
 * routes that do not require any auth
 */
export const publicRouter = Router()

publicRouter.get('/config', (_req, res) => {
  const configResponse: ConfigResponse = {
    appName: appConfig.APP_TITLE,
    zxcvbnMin: appConfig.ZXCVBN_MIN,
    emailActive: SMTP_VERIFIED,
    emailVerification: appConfig.EMAIL_VERIFICATION,
    registration: appConfig.SIGNUP,
  }

  res.send(configResponse)
})

publicRouter.post('/send_password_reset',
  ...validate<{ input: string }>({
    input: stringValidation,
  }),
  async (req: Request, res: Response) => {
    const { input } = matchedData<{ input: string }>(req)
    const user = await getUserByInput(input)

    if (!user) {
      res.sendStatus(404)
      return
    }

    const passwordReset: PasswordReset = {
      userId: user.id,
      challenge: nanoid(),
      createdAt: Date(),
      expiresAt: createExpiration(TTLs.PASSWORD_RESET),
    }
    await db().delete().table<PasswordReset>('password_reset').where('userId', user.id)
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

// TODO: password_reset
