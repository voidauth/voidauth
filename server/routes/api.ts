import { Router, type Request } from 'express'
import { router as interactionRouter } from './interaction'
import { provider } from '../oidc/provider'
import { commit, transaction, rollback } from '../db/db'
import { getUserById, isUnapproved, isUnverified } from '../db/user'
import { userRouter } from './user'
import { adminRouter } from './admin'
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'
import { authRouter } from './auth'
import { als } from '../util/als'
import { publicRouter } from './public'
import { proxyAuth } from '../util/proxyAuth'
import { getUserPasskeys } from '../db/passkey'
import appConfig from '../util/config'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: CurrentUserDetails
    }
  }
}

export const router = Router()

router.use((_req, _res, next) => {
  als.run({}, () => {
    next()
  })
})

// If method is post-put-patch-delete then use transaction
router.use(async (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    await transaction()
    res.on('finish', async () => {
      if (res.statusCode >= 500 && res.statusCode < 600) {
        await rollback()
      } else {
        await commit()
      }
    })
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
    res.sendStatus(400)
    return
  }
  await proxyAuth(url, req, res)
})

router.get('/authz/auth-request', async (req: Request, res) => {
  const headerUrl = req.headersDistinct['x-original-url']?.[0]
  const url = headerUrl ? URL.parse(headerUrl) : null
  if (!url) {
    res.sendStatus(400)
    return
  }
  await proxyAuth(url, req, res)
})

// Set user on request
router.use(async (req: Request, res, next) => {
  try {
    const ctx = provider.createContext(req, res)
    const session = await provider.Session.get(ctx)
    if (!session.accountId) {
      next()
      return
    }

    const user = await getUserById(session.accountId)

    if (user && !isUnapproved(user) && !isUnverified(user)) {
      const hasPasskeys = !!(await getUserPasskeys(user.id)).length
      req.user = {
        ...user,
        amr: session.amr,
        hasPasskeys,
      }
    }
  } catch (_e) {
    // do nothing
  }
  next()
})

router.get('/cb', (req, res) => {
  const { error, error_description, iss } = req.query
  if (error) {
    res.status(500).send({
      error,
      error_description,
      iss,
    })
    return
  }

  res.redirect(`${appConfig.APP_URL}/`)
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
