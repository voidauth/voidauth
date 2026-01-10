import { oidcLoginPath } from '@shared/oidc'
import { type Request, type Response } from 'express'
import { formatProxyAuthDomain, getProxyAuthWithCache } from '../db/proxyAuth'
import { checkPasswordHash, getUserByInput } from '../db/user'
import appConfig, { getSessionDomain, sessionDomainReaches } from './config'
import type { UserDetails } from '@shared/api-response/UserDetails'
import { ADMIN_GROUP } from '@shared/constants'
import { loginFactors } from '@shared/user'
import { userCanLogin } from './auth'
import { getSession } from '../oidc/provider'
import { logger } from './logger'

// proxy auth common
export async function proxyAuth(url: URL, method: 'forward-auth' | 'auth-request', req: Request, res: Response) {
  const formattedUrl = formatProxyAuthDomain(url)
  const redirCode = method === 'auth-request' ? 401 : 302

  const proxyAuthorizationHeader = req.headersDistinct['proxy-authorization']?.[0]
  const authorizationHeader = req.headersDistinct['authorization']?.[0]
  let user: UserDetails | undefined
  let amr: string[] = []

  if (!sessionDomainReaches(url.hostname)) {
    res.status(400).send({ message: `ProxyAuth Domain hostname '${url.hostname}' is not covered by session domain '${String(getSessionDomain())}'` })
    return
  }

  // check if user may access url
  // using a short cache
  const match = await getProxyAuthWithCache(url)

  if (req.user) {
    user = req.user
    amr = req.user.amr

    // Check that session is not too old
    const session = await getSession(req, res)
    if (match?.maxSessionLength && session?.past(match.maxSessionLength * 60)) {
      res.redirect(redirCode, `${appConfig.APP_URL}${oidcLoginPath(appConfig.APP_URL, { redirectUrl: url.href, isProxyAuth: true, prompt: 'login' })}`)
      res.send()
      return
    }
  } else if (proxyAuthorizationHeader) {
    // Proxy-Authorization header flow
    // Decode the Basic Authorization header
    const [, base64Credentials] = proxyAuthorizationHeader.split(' ')
    const [username, password] = base64Credentials ? Buffer.from(base64Credentials, 'base64').toString().split(':') : []
    user = username ? await getUserByInput(username) : undefined

    if (!user || !password || !await checkPasswordHash(user.id, password)) {
      res.setHeader('Proxy-Authenticate', `Basic realm="${formattedUrl}"`)
      res.redirect(407, `${appConfig.APP_URL}${oidcLoginPath(appConfig.APP_URL, { redirectUrl: url.href, isProxyAuth: true })}`)
      res.send()
      return
    }
    amr = ['pwd']
  } else if (authorizationHeader) {
    // Authorization header flow
    // Decode the Basic Authorization header
    const [, base64Credentials] = authorizationHeader.split(' ')
    const [username, password] = base64Credentials ? Buffer.from(base64Credentials, 'base64').toString().split(':') : []
    user = username ? await getUserByInput(username) : undefined

    if (!user || !password || !await checkPasswordHash(user.id, password)) {
      res.setHeader('WWW-Authenticate', `Basic realm="${formattedUrl}"`)
      res.redirect(401, `${appConfig.APP_URL}${oidcLoginPath(appConfig.APP_URL, { redirectUrl: url.href, isProxyAuth: true })}`)
      res.send()
      return
    }
    amr = ['pwd']
  } else {
    // User not logged in, redirect to login
    res.redirect(redirCode, `${appConfig.APP_URL}${oidcLoginPath(appConfig.APP_URL, { redirectUrl: url.href, isProxyAuth: true })}`)
    res.send()
    return
  }

  // Check that user is approved and verified and should be able to continue
  if (!userCanLogin(user, amr)) {
    // If not, redirect to login flow, which will send to correct redirect
    res.redirect(redirCode, `${appConfig.APP_URL}${oidcLoginPath(appConfig.APP_URL, { redirectUrl: url.href, isProxyAuth: true })}`)
    res.send()
    return
  }

  // Check that proxyAuth domain does not require MFA or user is logged in with MFA already
  if (!!match?.mfaRequired && loginFactors(amr) < 2) {
    // If not, redirect to login flow, which will send to correct redirect
    res.redirect(redirCode, `${appConfig.APP_URL}${oidcLoginPath(appConfig.APP_URL, { redirectUrl: url.href, isProxyAuth: true })}`)
    res.send()
    return
  }

  // Check user groups for access if not an admin
  if (!user.groups.some(g => g.name === ADMIN_GROUP)) {
    if (!match) {
      const logInfo = {
        reason: 'no_domain_match',
        url: url.href,
        urlDomain: formattedUrl,
      }
      logger.debug(`proxyauth forbidden: ${JSON.stringify(logInfo)}`)
      res.status(403).send(logInfo)
      return
    } else if (match.groups.length && !user.groups.some(g => match.groups.includes(g.name))) {
      const logInfo = {
        reason: 'user_group_missing',
        url: url.href,
        urlDomain: formattedUrl,
        domain: match.domain,
        domainGroups: match.groups,
      }
      logger.debug(`proxyauth forbidden: ${JSON.stringify(logInfo)}`)
      res.status(403).send(logInfo)
      return
    }
  }

  // Set Trusted Header Auth headers
  try {
    res.setHeader('Remote-User', user.username)
  } catch (_e) {
    res.setHeader('Remote-User', encodeURIComponent(user.username))
  }
  if (user.email) {
    try {
      res.setHeader('Remote-Email', user.email)
    } catch (_e) {
      res.setHeader('Remote-Email', encodeURIComponent(user.email))
    }
  }
  if (user.name) {
    try {
      res.setHeader('Remote-Name', user.name)
    } catch (_e) {
      res.setHeader('Remote-Name', encodeURIComponent(user.name))
    }
  }
  if (user.groups.length) {
    const groupsList: string[] = []
    for (const group of user.groups) {
      try {
        res.setHeader('Remote-Groups', groupsList.concat([group.name]).join(','))
        groupsList.push(group.name)
      } catch (_e) {
        res.setHeader('Remote-Groups', groupsList.concat([encodeURIComponent(group.name)]).join(','))
        groupsList.push(encodeURIComponent(group.name))
      }
    }
  }
  logger.debug(`proxyauth access granted${match ? ` to domain: ${match.domain}` : ''}`)
  res.status(200).send()
}
