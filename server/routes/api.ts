import { Router, type Request, type Response } from 'express'
import { getInteractionDetails, router as interactionRouter } from './interaction'
import { getUserById } from '../db/user'
import { userRouter } from './user'
import { adminRouter } from './admin'
import type { CurrentUserPrivateDetails, UserDetails } from '@shared/api-response/UserDetails'
import { authRouter } from './auth'
import { publicRouter } from './public'
import { proxyAuth } from '../util/proxyAuth'
import appConfig, { sessionDomainReaches } from '../util/config'
import { logger } from '../util/logger'
import { userCanLogin, userIsPrivileged, userIsPrivilegedForEmail, userIsPrivilegedForTotpCreate } from '../util/auth'
import { getSession } from '../oidc/provider'
import { transaction } from '../db/db'
import { zodValidate } from '../util/zodValidate'
import zod from 'zod'
import { getProxyAuthWithCache } from '../db/proxyAuth'

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
router.use(async (req: Request, res: Response, next) => {
  try {
    const user = await getUserSessionInteraction(req, res)

    if (user) {
      req.user = user
    }
  } catch (_e) {
    // do nothing
  }
  next()
})

// proxy cookie auth endpoints
router.get('/authz/forward-auth', async (req: Request, res) => {
  const proto = req.headersDistinct['x-forwarded-proto']?.[0]
  const host = req.headersDistinct['x-forwarded-host']?.[0]
  const path = req.headersDistinct['x-forwarded-uri']?.[0]
  const url = proto && host ? URL.parse(`${proto}://${host}${path ?? ''}`) : null
  if (!url) {
    logger({
      level: 'error',
      message: 'Invalid x-forwarded headers in ProxyAuth Domain request.',
    })
    res.sendStatus(400)
    return
  }
  await proxyAuth(url, 'forward-auth', req, res)
})

router.get('/authz/auth-request', async (req: Request, res) => {
  const headerUrl = req.headersDistinct['x-original-url']?.[0]
  const url = headerUrl ? URL.parse(headerUrl) : null
  if (!url) {
    logger({
      level: 'error',
      message: 'Invalid x-original-url header in ProxyAuth Domain request.',
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

export async function getUserSessionInteraction(req: Request, res: Response) {
  // get user from session or interaction
  let user: UserDetails | undefined
  let amr: string[] = []
  let source: string | null = null

  const session = await getSession(req, res)
  const accountId = session?.accountId
  if (accountId) {
    amr = [...new Set([...amr, ...(session.amr ?? [])])]
    user = await getUserById(accountId)
    source = 'session'
  }

  const interaction = await getInteractionDetails(req, res)
  if (interaction) {
    if (!user) {
      const accountId = interaction.result?.login?.accountId
      if (accountId) {
        user = await getUserById(accountId)
        source = 'interaction'
      }
    }
    if (user && user.id === interaction.result?.login?.accountId) {
      amr = [...new Set([...amr, ...(interaction.result.login.amr ?? [])])]
    }
  }

  if (!user) {
    return undefined
  }

  const currentUser: CurrentUserPrivateDetails | undefined = {
    ...user,
    amr,
    canLogin: userCanLogin(user, amr),
    isPrivilegedForTotpCreate: userIsPrivilegedForTotpCreate(user, amr),
    isPrivilegedForEmail: userIsPrivilegedForEmail(user, amr),
    isPrivileged: userIsPrivileged(user, amr),
  }

  logger({
    level: 'debug',
    message: `User found in ${String(source)}`,
    details: {
      user: {
        id: currentUser.id,
        username: currentUser.username,
        source: source ?? 'unknown',
        amr: currentUser.amr,
      },
    },
  })

  return currentUser
}
