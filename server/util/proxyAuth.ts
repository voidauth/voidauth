import { proxyAuthPath } from '@shared/oidc'
import { type Request, type Response } from 'express'
import { formatProxyAuthDomain, getProxyAuthWithCache } from '../db/proxyAuth'
import appConfig, { appUrl, getSessionDomain, sessionDomainReaches } from './config'
import { ADMIN_GROUP, REDIRECT_PATHS } from '@shared/constants'
import { loginFactors } from '@shared/user'
import { getSession } from '../oidc/provider'
import { logger } from './logger'

// proxy auth common
export async function proxyAuth(url: URL, method: 'forward-auth' | 'auth-request', req: Request, res: Response) {
  const formattedUrl = formatProxyAuthDomain(url)
  const redirCode = method === 'auth-request' ? 401 : 302

  // should not block access to itself
  const appURL = appUrl()
  const urlPath = url.pathname
  const appPath = appURL.pathname // ex. / or /auth
  const appRoot = appPath.endsWith('/') ? appPath : appPath + '/' // ex. / or /auth/
  if (url.href.startsWith(appURL.href) && (urlPath === appPath || urlPath.startsWith(appRoot))) {
    logger({
      level: 'debug',
      message: `ProxyAuth access granted, request to self URL`,
      proxyauth: {
        action: 'access_granted',
        reason: 'request_to_self_url',
      },
    })
    res.status(200).send()
    return
  }

  if (!sessionDomainReaches(url.hostname)) {
    res.status(400).send({ message: `ProxyAuth Domain hostname '${url.hostname}' is not covered by session domain '${String(getSessionDomain())}'` })
    return
  }

  // check if user may access url
  // using a short cache
  const match = await getProxyAuthWithCache(url)
  if (!match) {
    logger({
      level: 'debug',
      message: `ProxyAuth forbidden due to no domain match`,
      proxyauth: {
        action: 'forbidden',
        reason: 'proxyauth_domain_no_match',
        url: url.href,
        urlDomain: formattedUrl,
      },
    })
    res.redirect(redirCode, `${appConfig.APP_URL}/${REDIRECT_PATHS.FORBIDDEN}?reason=proxyauth_domain_no_match`)
    return
  }

  const user = req.user
  const amr = user?.amr ?? []
  if (!user) {
    if (req.get('proxy-authorization')) {
      // header was set but user was not found
      res.setHeader('Proxy-Authenticate', `Basic realm="${formattedUrl}"`)
      res.redirect(407, `${appConfig.APP_URL}${proxyAuthPath(appConfig.APP_URL, url.href)}`)
      return
    } else if (req.get('authorization')) {
      // header was set but user was not found
      res.setHeader('WWW-Authenticate', `Basic realm="${formattedUrl}"`)
      res.redirect(401, `${appConfig.APP_URL}${proxyAuthPath(appConfig.APP_URL, url.href)}`)
      return
    } else {
      // User not logged in, redirect to login
      logger({
        level: 'debug',
        message: `Session not found, redirect to login`,
        proxyauth: {
          action: 'redirect_to_login',
          reason: 'session_not_found',
          url: url.href,
          matchedDomain: match.domain,
        },
      })
      res.redirect(redirCode, `${appConfig.APP_URL}${proxyAuthPath(appConfig.APP_URL, url.href)}`)
      return
    }
  }

  // Check that session is not too old
  const session = await getSession(req, res)
  if (match.maxSessionLength && session?.past(match.maxSessionLength * 60)) {
    res.redirect(redirCode, `${appConfig.APP_URL}${proxyAuthPath(appConfig.APP_URL, url.href, 'login')}`)
    return
  }

  // Check that user is approved and verified and should be able to continue
  if (!user.canLogin) {
    // If not, redirect to login flow, which will send to correct redirect
    logger({
      level: 'debug',
      message: `User has not finished login`,
      proxyauth: {
        action: 'redirect_to_login',
        reason: 'login_not_finished',
        url: url.href,
        matchedDomain: match.domain,
      },
    })
    res.redirect(redirCode, `${appConfig.APP_URL}${proxyAuthPath(appConfig.APP_URL, url.href)}`)
    return
  }

  // Check that proxyAuth domain does not require MFA or user is logged in with MFA already
  // Even if user has MFA session, user must also have MFA enabled on their account
  if (!!match.mfaRequired && (loginFactors(amr) < 2 || !user.mfaRequired)) {
    // If not, redirect to login flow, which will send to correct redirect
    logger({
      level: 'debug',
      message: `MFA required for domain`,
      proxyauth: {
        action: 'redirect_to_login',
        reason: 'domain_mfa_required',
        url: url.href,
        matchedDomain: match.domain,
      },
    })
    res.redirect(redirCode, `${appConfig.APP_URL}${proxyAuthPath(appConfig.APP_URL, url.href)}`)
    return
  }

  // Check user groups for access if not an admin
  if (!user.groups.some(g => g.name === ADMIN_GROUP)) {
    if (match.groups.length && !user.groups.some(g => match.groups.includes(g.name))) {
      logger({
        level: 'debug',
        message: `ProxyAuth forbidden due to user groups missing any group for domain`,
        proxyauth: {
          action: 'forbidden',
          reason: 'user_group_missing',
          url: url.href,
          urlDomain: formattedUrl,
          matchedDomain: match.domain,
          domainGroups: match.groups,
        },
      })
      res.redirect(redirCode, `${appConfig.APP_URL}/${REDIRECT_PATHS.FORBIDDEN}?reason=user_group_missing`)
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
      // Write groups one by one to catch any that cause issues
      try {
        res.setHeader('Remote-Groups', groupsList.concat([group.name]).join(','))
        groupsList.push(group.name)
      } catch (_e) {
        try {
          res.setHeader('Remote-Groups', groupsList.concat([encodeURIComponent(group.name)]).join(','))
          groupsList.push(encodeURIComponent(group.name))
        } catch (_e) {
          // If even encoding fails, skip the group but log it
          logger({
            level: 'debug',
            message: `Failed to set Remote-Groups header for group, skipping group`,
            proxyauth: {
              action: 'set_header_failed',
              reason: group.name,
              url: url.href,
              matchedDomain: match.domain,
            },
          })
        }
      }
    }
  }
  logger({
    level: 'debug',
    message: `ProxyAuth access granted`,
    proxyauth: {
      action: 'access_granted',
      matchedDomain: match.domain,
      reason: 'checks_passed',
    },
  })
  res.status(200).send()
}
