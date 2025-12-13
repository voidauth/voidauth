import { oidcLoginPath } from '@shared/oidc'
import { type Request, type Response } from 'express'
import { isMatch } from 'matcher'
import { getProxyAuths } from '../db/proxyAuth'
import { checkPasswordHash, getUserByInput } from '../db/user'
import appConfig, { appUrl } from './config'
import type { UserDetails } from '@shared/api-response/UserDetails'
import { ADMIN_GROUP } from '@shared/constants'
import type { ProxyAuthResponse } from '@shared/api-response/admin/ProxyAuthResponse'
import { loginFactors } from '@shared/user'
import * as psl from 'psl'
import { userCanLogin } from './auth'

// proxy auth cache
let proxyAuthCache: Pick<ProxyAuthResponse, 'domain' | 'mfaRequired' | 'groups'>[] = []
let proxyAuthCacheExpires: number = 0

// proxy auth common
export async function proxyAuth(url: URL, method: 'forward-auth' | 'auth-request', req: Request, res: Response) {
  const formattedUrl = formatProxyAuthDomain(url)
  const redirCode = method === 'auth-request' ? 401 : 302

  const proxyAuthorizationHeader = req.headersDistinct['proxy-authorization']?.[0]
  const authorizationHeader = req.headersDistinct['authorization']?.[0]
  let user: UserDetails | undefined
  let amr: string[] = []

  const baseUrlDomain = psl.get(url.hostname)
  const baseAPP_URLDomain = psl.get(appUrl().hostname)
  if (baseUrlDomain !== baseAPP_URLDomain) {
    res.status(400).send({ message: `ProxyAuth Domain base domain ${String(baseUrlDomain)} does not equal $APP_URL base domain ${String(baseAPP_URLDomain)}. Base domain names must match.` })
    return
  }

  if (req.user) {
    user = req.user
    amr = req.user.amr
  } else if (proxyAuthorizationHeader) {
    // Proxy-Authorization header flow
    // Decode the Basic Authorization header
    const [, base64Credentials] = proxyAuthorizationHeader.split(' ')
    const [username, password] = base64Credentials ? Buffer.from(base64Credentials, 'base64').toString().split(':') : []
    user = username ? await getUserByInput(username) : undefined

    if (!user || !password || !await checkPasswordHash(user.id, password)) {
      res.setHeader('Proxy-Authenticate', `Basic realm="${formattedUrl}"`)
      res.redirect(407, `${appConfig.APP_URL}${oidcLoginPath(appConfig.APP_URL, url.href, true)}`)
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
      res.redirect(401, `${appConfig.APP_URL}${oidcLoginPath(appConfig.APP_URL, url.href, true)}`)
      res.send()
      return
    }
    amr = ['pwd']
  } else {
    // User not logged in, redirect to login
    res.redirect(redirCode, `${appConfig.APP_URL}${oidcLoginPath(appConfig.APP_URL, url.href, true)}`)
    res.send()
    return
  }

  // Check that user is approved and verified and should be able to continue
  if (!userCanLogin(user, amr)) {
    // If not, redirect to login flow, which will send to correct redirect
    res.redirect(redirCode, `${appConfig.APP_URL}${oidcLoginPath(appConfig.APP_URL, url.href, true)}`)
    res.send()
    return
  }

  // check if user may access url
  // using a short cache
  const match = await getProxyAuthWithCache(url)

  // Check that proxyAuth domain does not require MFA or user is logged in with MFA already
  if (!!match?.mfaRequired && loginFactors(amr) < 2) {
    // If not, redirect to login flow, which will send to correct redirect
    res.redirect(redirCode, `${appConfig.APP_URL}${oidcLoginPath(appConfig.APP_URL, url.href, true)}`)
    res.send()
    return
  }

  // Check user groups for access if not an admin
  if (!user.groups.some(g => g.name === ADMIN_GROUP)) {
    if (!match || (match.groups.length && !user.groups.some(g => match.groups.includes(g.name)))) {
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
    res.setHeader('Remote-Groups', user.groups.map(g => g.name).join(','))
  }
  res.send()
}

export async function getProxyAuthWithCache(url: URL) {
  const formattedUrl = formatProxyAuthDomain(url)
  if (proxyAuthCacheExpires < new Date().getTime()) {
    proxyAuthCache = await getProxyAuths()

    proxyAuthCacheExpires = new Date().getTime() + 30000 // 30 seconds
  }

  return proxyAuthCache.find(d => isMatch(formattedUrl, d.domain))
}

function formatProxyAuthDomain(url: URL) {
  return `${url.hostname}${url.pathname}`
}
