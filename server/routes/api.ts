import { Router, type Request } from 'express'
import { router as interactionRouter } from './interaction'
import { provider } from '../oidc/provider'
import { commit, createTransaction, db } from '../db/db'
import { getUserById } from '../db/user'
import { userRouter } from './user'
import type { Group, UserGroup } from '@shared/db/Group'
import { adminRouter } from './admin'
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'
import { authRouter } from './auth'
import { als } from '../util/als'
import { publicRouter } from './public'
import { proxyAuth } from '../util/proxyAuth'
import { passkeyRouter } from './passkey'

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
    await createTransaction()
    res.on('finish', async () => {
      await commit()
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

// Set user on reqest
router.use(async (req: Request, res, next) => {
  try {
    const ctx = provider.createContext(req, res)
    const session = await provider.Session.get(ctx)
    if (!session.accountId) {
      next()
      return
    }

    const user = await getUserById(session.accountId)

    if (user) {
      req.user = {
        ...user,
        groups: (await db().select()
          .table<UserGroup>('user_group')
          .innerJoin<Group>('group', 'user_group.groupId', 'group.id')
          .where({ userId: user.id }).orderBy('name', 'asc'))
          .map((g) => {
            return g.name
          }),
        amr: session.amr,
      }
    }
  } catch (_e) {
    // do nothing
  }
  next()
})

router.get('/cb', async (req, res) => {
  const { error, error_description, iss } = req.query
  if (error) {
    res.status(500).send({
      error,
      error_description,
      iss,
    })
    return
  }

  // Get session info, see if passkey was used to sign in
  let query = ''
  const ctx = provider.createContext(req, res)
  const session = await provider.Session.get(ctx)
  if (!session.amr?.includes('webauthn')) {
    query += '?action=passkey'
  }

  res.redirect(`/${query}`)
})

router.use('/public', publicRouter)

router.use('/auth', authRouter)

router.use('/interaction', interactionRouter)

router.use('/user', userRouter)

router.use('/admin', adminRouter)

router.use('/passkey', passkeyRouter)

// API route was not found
router.use((_req, res) => {
  res.sendStatus(404)
  res.end()
})
