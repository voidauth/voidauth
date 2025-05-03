import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { Router } from 'express'
import appConfig from '../util/config'
import { SMTP_VERIFIED } from '../util/email'

/**
 * routes that do not require any auth
 */
export const publicRouter = Router()

publicRouter.get('/config', (_req, res) => {
  const configResponse: ConfigResponse = {
    appName: appConfig.APP_TITLE,
    emailActive: SMTP_VERIFIED,
    emailVerification: appConfig.EMAIL_VERIFICATION,
    registration: appConfig.SIGNUP,
  }

  res.send(configResponse)
})
