import { oidcLoginPath } from '@shared/oidc'
import { type Request, type Response } from 'express'
import { isMatch } from 'matcher'
import { getProxyAuths } from '../db/proxyAuth'
import { checkPasswordHash, getUserById, getUserByInput, isUnapproved, isUnverified } from '../db/user'
import { provider } from '../oidc/provider'
import appConfig from './config'
import type { UserDetails } from '@shared/api-response/UserDetails'
import { ADMIN_GROUP } from '@shared/constants'

// proxy auth cache
let proxyAuthCache: { domain: string, groups: string[] }[] = []
let proxyAuthCacheExpires: number = 0

// proxy auth common
export async function proxyAuth(url: URL, req: Request, res: Response) {
  const formattedUrl = `${url.hostname}${url.pathname}`

  const ctx = provider.createContext(req, res)
  const sessionId = ctx.cookies.get('x-voidauth-session-uid')
  const authorizationHeader = req.headersDistinct['authorization']?.[0]
  let user: UserDetails | undefined

  if (sessionId) {
    // Check for invalid session
    const session = sessionId ? await provider.Session.adapter.findByUid(sessionId) : null
    const accountId = session?.accountId
    user = accountId ? await getUserById(accountId) : undefined

    if (!user) {
      res.redirect(`${appConfig.APP_URL}${oidcLoginPath(url.href)}`)
      res.send()
      return
    }
  } else if (authorizationHeader) {
    // Authorization header flow
    // Decode the Basic Authorization header
    const [, base64Credentials] = authorizationHeader.split(' ')
    const [username, password] = base64Credentials ? Buffer.from(base64Credentials, 'base64').toString().split(':') : []
    user = username ? await getUserByInput(username) : undefined
    if (!user || !password || !await checkPasswordHash(user.id, password)) {
      res.setHeader('WWW-Authenticate', `Basic realm="${formattedUrl}"`)
      res.sendStatus(401)
      return
    }
  } else {
    // User not logged in, redirect to login
    res.redirect(`${appConfig.APP_URL}${oidcLoginPath(url.href)}`)
    res.send()
    return
  }

  // Check that user is approved and verified
  if (isUnapproved(user) || isUnverified(user)) {
    res.sendStatus(403)
    return
  }

  // Check user groups for access if not an admin
  if (!user.groups.includes(ADMIN_GROUP)) {
    // check if user may access url
    // using a short cache
    if (proxyAuthCacheExpires < new Date().getTime()) {
      proxyAuthCache = await getProxyAuths()

      proxyAuthCacheExpires = new Date().getTime() + 30000 // 30 seconds
    }

    const match = proxyAuthCache.find(d => isMatch(formattedUrl, d.domain))

    if (!match || (match.groups.length && !user.groups.some(g => match.groups.includes(g)))) {
      res.sendStatus(403)
      return
    }
  }

  res.setHeader('Remote-User', user.username)
  if (user.email) {
    res.setHeader('Remote-Email', user.email)
  }
  if (user.name) {
    res.setHeader('Remote-Name', user.name)
  }
  if (user.groups.length) {
    res.setHeader('Remote-Groups', user.groups.join(','))
  }
  res.send()
}
