import type { UserDetails, CurrentUserPrivateDetails } from '@shared/api-response/UserDetails'
import type { amrFactor } from '@shared/user'
import { checkPasswordHash, getUserById, getUserByInput } from '../db/user'
import { getSession } from '../oidc/provider'
import { getInteractionDetails } from '../routes/interaction'
import {
  userCanLogin,
  userIsPrivilegedForTotpCreate,
  userIsPrivilegedForPasskeyCreate,
  userIsPrivilegedForEmail,
  userIsPrivilegedForTotpValidate,
} from './auth'
import { logger } from './logger'
import type { NextFunction, Request, Response } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'

export async function getUserSessionInteraction(req: Request, res: Response) {
  // get user from session or interaction
  let user: UserDetails | undefined
  let amr: amrFactor[] = []
  let source: string | null = null

  const session = await getSession(req, res)
  const accountId = session?.accountId
  if (accountId) {
    amr = [...new Set([...amr, ...(session.amr ?? []) as amrFactor[]])]
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
      amr = [...new Set([...amr, ...(interaction.result.login.amr ?? []) as amrFactor[]])]
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
    isPrivilegedForTotpValidate: userIsPrivilegedForTotpValidate(user, amr),
    isPrivilegedForPasskeyCreate: userIsPrivilegedForPasskeyCreate(user, amr),
    isPrivilegedForEmail: userIsPrivilegedForEmail(user, amr),
  }

  logger({
    level: 'debug',
    message: `User found in ${String(source)}`,
    user: {
      id: currentUser.id,
      username: currentUser.username,
      source: source ?? 'unknown',
      amr: currentUser.amr,
    },
  })

  return currentUser
}

export async function getUserBySession(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getUserSessionInteraction(req, res)

    if (user) {
      req.user = user
    }
  } catch (_e) {
    // do nothing
  }
  next()
}

const MAX_BASIC_AUTH_FAILS = 2

export const getUserByBasicAuth = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: MAX_BASIC_AUTH_FAILS,
  legacyHeaders: false,
  skip: async (req) => {
    try {
      // do not overwrite existing user in the request
      if (req.user) {
        return true
      }

      // Only rate limit requests that include auth header
      const authorizationHeader = req.get('proxy-authorization') || req.get('authorization')
      if (!authorizationHeader) {
        return true
      }

      // if request should already be rate-limited, never skip
      const failures = await getUserByBasicAuth.getKey(ipKeyGenerator(req.ip || ''))
      if (failures && failures.totalHits >= MAX_BASIC_AUTH_FAILS && failures.resetTime && failures.resetTime.getTime() > Date.now()) {
        return false
      }

      // Try getting user with auth header
      // Decode the Basic Authorization header
      const [, base64Credentials] = authorizationHeader.split(' ')
      const [username, password] = base64Credentials ? Buffer.from(base64Credentials, 'base64').toString().split(':') : []
      const user = username ? await getUserByInput(username) : undefined
      if (!user || !password || !await checkPasswordHash(user.id, password)) {
      // Invalid auth header, rate-limit this request
        return false
      }

      req.user = {
        ...user,
        amr: ['pwd'],
        canLogin: userCanLogin(user, ['pwd']),
        // auth-header user cannot do account management
        isPrivilegedForTotpCreate: false,
        isPrivilegedForTotpValidate: false,
        isPrivilegedForPasskeyCreate: false,
        isPrivilegedForEmail: false,
      }

      logger({
        level: 'debug',
        message: `User found in authorization or proxy-authorization header`,
        user: {
          id: req.user.id,
          username: req.user.username,
          source: 'authorization-header',
          amr: req.user.amr,
        },
      })
    } catch (e) {
      logger({
        level: 'error',
        message: 'Error occurred while processing basic auth',
        errors: [e instanceof Error ? e : { message: String(e) }],
      })
    }
    // User was found successfully or there was an uncaught error, skip failure rate-limiting
    return true
  },
})
