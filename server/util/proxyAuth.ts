import type { UserWithoutPassword } from '@shared/api-response/UserDetails'
import type { Group, UserGroup } from '@shared/db/Group'
import type { User } from '@shared/db/User'
import { oidcLoginPath } from '@shared/oidc'
import { type Request, type Response } from 'express'
import { isMatch } from 'matcher'
import { db } from '../db/db'
import { getProxyAuths } from '../db/proxyAuth'
import { getUserById, getUserByInput } from '../db/user'
import { provider } from '../oidc/provider'
import appConfig from './config'
import * as argon2 from 'argon2'

// proxy auth cache
let proxyAuthCache: { domain: string, groups: string[] }[] = []
let proxyAuthCacheExpires: number = 0

// proxy auth common
export async function proxyAuth(url: URL, req: Request, res: Response) {
  const formattedUrl = `${url.hostname}${url.pathname}`

  const ctx = provider.createContext(req, res)
  const sessionId = ctx.cookies.get('x-voidauth-session-uid')
  const authorizationHeader = req.headersDistinct['authorization']?.[0]
  let user: User | UserWithoutPassword | undefined

  if (sessionId) {
    // Cookie auth flow
    const session = sessionId ? await provider.Session.adapter.findByUid(sessionId) : null
    const accountId = session?.accountId
    user = accountId ? await getUserById(accountId) : undefined
    if (!user) {
      res.redirect(`${appConfig.APP_URL}${oidcLoginPath(url.href)}`)
      return
    }
  } else if (authorizationHeader) {
    // Authorization header flow
    // Decode the Basic Authorization header
    const [, base64Credentials] = authorizationHeader.split(' ')
    const [username, password] = base64Credentials ? Buffer.from(base64Credentials, 'base64').toString().split(':') : []
    user = username ? await getUserByInput(username) : undefined
    if (!user || !password || !await argon2.verify(user.passwordHash, password)) {
      res.setHeader('WWW-Authenticate', `Basic realm="${formattedUrl}"`)
      res.sendStatus(401)
      return
    }
  } else {
    // flow missing, go to login
    res.redirect(`${appConfig.APP_URL}${oidcLoginPath(url.href)}`)
    return
  }

  const groups = await db().select('name')
    .table<Group>('group')
    .innerJoin<UserGroup>('user_group', 'user_group.groupId', 'group.id').where({ userId: user.id })
    .orderBy('name', 'asc')

  // check if user may access url
  // using a short cache
  if (proxyAuthCacheExpires < new Date().getTime()) {
    proxyAuthCache = await getProxyAuths()

    proxyAuthCacheExpires = new Date().getTime() + 30000 // 30 seconds
  }

  const match = proxyAuthCache.find(d => isMatch(formattedUrl, d.domain))

  if (!match || (match.groups.length && !groups.some(g => match.groups.includes(g.name)))) {
    res.sendStatus(403)
    return
  }

  res.setHeader('Remote-User', user.username)
  if (user.email) {
    res.setHeader('Remote-Email', user.email)
  }
  if (user.name) {
    res.setHeader('Remote-Name', user.name)
  }
  if (groups.length) {
    res.setHeader('Remote-Groups', groups.map(g => g.name).join(','))
  }
  res.send()
}
