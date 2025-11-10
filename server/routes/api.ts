import { Router, type Request, type Response } from 'express'
import { getInteractionDetails, getSession, router as interactionRouter } from './interaction'
import { commit, transaction, rollback } from '../db/db'
import { amrRequired, getUserById, isUnapproved, isUnverified } from '../db/user'
import { userRouter } from './user'
import { adminRouter } from './admin'
import type { CurrentUserDetails, UserDetails } from '@shared/api-response/UserDetails'
import { authRouter } from './auth'
import { als } from '../util/als'
import { publicRouter } from './public'
import { proxyAuth } from '../util/proxyAuth'
import appConfig from '../util/config'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessionUser: CurrentUserDetails | undefined // user indicated by the session
      loggedInUser: CurrentUserDetails | undefined // sessionUser if canLogin
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

// Set user on request
router.use(async (req: Request, res: Response, next) => {
  try {
    const { user, amr } = await getUserSessionInteraction(req, res)

    if (user) {
      req.sessionUser = user
    }

    if (userCanLogin(user, amr)) {
      req.loggedInUser = user
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
    res.sendStatus(400)
    return
  }
  await proxyAuth(url, 'forward-auth', req, res)
})

router.get('/authz/auth-request', async (req: Request, res) => {
  const headerUrl = req.headersDistinct['x-original-url']?.[0]
  const url = headerUrl ? URL.parse(headerUrl) : null
  if (!url) {
    res.sendStatus(400)
    return
  }
  await proxyAuth(url, 'auth-request', req, res)
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

async function getUserSessionInteraction(req: Request, res: Response) {
  // get user from session or interaction
  let user: UserDetails | undefined
  let amr: string[] = []

  const session = await getSession(req, res)
  const accountId = session?.accountId
  if (accountId) {
    amr = [...new Set([...amr, ...(session.amr ?? [])])]
    user = await getUserById(accountId)
  }

  const interaction = await getInteractionDetails(req, res)
  if (interaction) {
    if (!user) {
      const accountId = interaction.result?.login?.accountId
      if (accountId) {
        user = await getUserById(accountId)
      }
    }
    if (user && user.id === interaction.result?.login?.accountId) {
      amr = [...new Set([...amr, ...(interaction.result.login.amr ?? [])])]
    }
  }

  const currentUser: CurrentUserDetails | undefined = user
    ? {
        ...user,
        amr,
      }
    : undefined

  return {
    amr,
    user: currentUser,
  }
}

export function userCanLogin(user: UserDetails | undefined, amr: string[]): user is UserDetails {
  return !!user && !amrRequired(user.hasTotp, amr) && !isUnapproved(user) && !isUnverified(user)
}

export function userCouldMFA(user: CurrentUserDetails | undefined) {
  return !!user && !user.hasPasskeys && !user.hasTotp
}
