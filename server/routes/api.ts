import { Router, type Request } from 'express'
import { router as interactionRouter } from './interaction'
import { userRouter } from './user'
import { adminRouter } from './admin'
import type { CurrentUserPrivateDetails } from '@shared/api-response/UserDetails'
import { authRouter } from './auth'
import { publicRouter } from './public'
import { proxyAuth } from '../util/proxyAuth'
import appConfig, { sessionDomainReaches } from '../util/config'
import { logger } from '../util/logger'
import { transaction } from '../db/db'
import { zodValidate } from '../util/zodValidate'
import zod from 'zod'
import { getProxyAuthWithCache } from '../db/proxyAuth'
import { getUserByBasicAuth, getUserBySession } from '../util/userMiddleware'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: CurrentUserPrivateDetails | undefined // user indicated by the session
    }
  }
}

export const router = Router()

router.use(async (req, _res, next) => {
  // If method is post-put-patch-delete then use transaction
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    await transaction()
  }
  next()
})

// Set user on request
router.use(getUserBySession)

// proxy cookie auth endpoints
router.get('/authz/forward-auth', getUserByBasicAuth, async (req: Request, res) => {
  const proto = req.get('x-forwarded-proto')
  const host = req.get('x-forwarded-host')
  const path = req.get('x-forwarded-uri')
  const url = proto && host ? URL.parse(`${proto}://${host}${path ?? ''}`) : null
  if (!url) {
    logger({
      level: 'error',
      message: 'Invalid x-forwarded headers in ProxyAuth Domain request.',
      errors: [{
        message: 'X-Forwarded-* headers in a ProxyAuth Domain request were not properly set.',
      }],
    })
    res.sendStatus(400)
    return
  }
  await proxyAuth(url, 'forward-auth', req, res)
})

router.get('/authz/auth-request', getUserByBasicAuth, async (req: Request, res) => {
  const headerUrl = req.get('x-original-url')
  const url = headerUrl ? URL.parse(headerUrl) : null
  if (!url) {
    logger({
      level: 'error',
      message: 'Invalid X-Original-Url header in ProxyAuth Domain request.',
      errors: [{
        message: 'X-Original-Url header in a ProxyAuth Domain request was not properly set.',
      }],
    })
    res.sendStatus(400)
    return
  }
  await proxyAuth(url, 'auth-request', req, res)
})

router.get('/cb',
  zodValidate({
    query: {
      defaultRedir: zod.stringbool().optional(),
      error: zod.string().optional(),
      error_description: zod.string().optional(),
      iss: zod.string().optional(),
    },
  }),
  (req, res) => {
    const { error, defaultRedir } = req.query
    if (error) {
      res.status(500).send({
        message: 'Error occurred during authentication.',
      })
      return
    }

    const redir = defaultRedir && appConfig.DEFAULT_REDIRECT ? appConfig.DEFAULT_REDIRECT : appConfig.APP_URL

    res.redirect(redir)
    return
  })

router.get('/proxyauth_cb',
  zodValidate({
    query: {
      error: zod.string().optional(),
      error_description: zod.string().optional(),
      iss: zod.string().optional(),
      proxyauth_url: zod.string().optional(),
    },
  }),
  async (req, res) => {
    const { error, proxyauth_url } = req.query
    if (error) {
      res.status(500).send({
        message: 'Error occurred during ProxyAuth authentication.',
      })
      return
    }

    const proxyAuthURL = typeof proxyauth_url === 'string' ? URL.parse(proxyauth_url) : null
    if (!proxyAuthURL || !sessionDomainReaches(proxyAuthURL.hostname) || !(await getProxyAuthWithCache(proxyAuthURL))) {
      logger({
        level: 'error',
        message: 'Invalid proxyauth_url query parameter in ProxyAuth callback.',
        errors: [{
          message: 'An invalid proxyauth_url parameter was provided to the proxy auth callback endpoint.',
        }],
      })
      res.status(400).send({ message: 'Invalid proxyauth_url query parameter in ProxyAuth callback.' })
      return
    }

    res.redirect(proxyAuthURL.href)
    return
  })

router.use('/public', publicRouter)

router.use('/auth', authRouter)

router.use('/interaction', interactionRouter)

router.use('/user', userRouter)

router.use('/admin', adminRouter)

// API route was not found
router.use((_req, res) => {
  res.sendStatus(404)
  res.end()
})
