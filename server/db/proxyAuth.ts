import { db } from './db'
import type { Group, ProxyAuthGroup } from '@shared/db/Group'
import type { ProxyAuth } from '@shared/db/ProxyAuth'
import { urlFromWildcardDomain, sortWildcardDomains } from '@shared/url'
import type { ProxyAuthResponse } from '@shared/api-response/admin/ProxyAuthResponse'
import { isMatch } from 'matcher'
import { TABLES } from '@shared/db'

// proxy auth cache
let proxyAuthCache: Pick<ProxyAuthResponse, 'domain' | 'mfaRequired' | 'groups' | 'maxSessionLength'>[] = []
let proxyAuthCacheExpires: number = 0

export async function getProxyAuthWithCache(url: URL) {
  const formattedUrl = formatProxyAuthDomain(url)
  if (proxyAuthCacheExpires < new Date().getTime()) {
    proxyAuthCache = await getProxyAuths()

    proxyAuthCacheExpires = new Date().getTime() + 30000 // 30 seconds
  }

  return proxyAuthCache.find((d) => {
    const purl = urlFromWildcardDomain(d.domain)
    return purl && isMatch(formattedUrl, formatProxyAuthDomain(purl))
  })
}

export function formatProxyAuthDomain(url: Pick<URL, 'hostname' | 'port' | 'pathname'>) {
  return `${url.hostname}:${url.port || '*'}${url.pathname}`
}

export async function getProxyAuths(): Promise<ProxyAuthResponse[]> {
  const proxyAuths: ProxyAuthResponse[] = (await db().select().table<ProxyAuth>(TABLES.PROXY_AUTH))
    .map((p) => {
      return {
        ...p,
        groups: [],
      }
    }).sort((a, b) => sortWildcardDomains(a.domain, b.domain))

  const groups = await db().select('proxyAuthId', 'name').table<ProxyAuthGroup>(TABLES.PROXY_AUTH_GROUP)
    .innerJoin<Group>(TABLES.GROUP, 'proxy_auth_group.groupId', 'group.id')

  proxyAuths.forEach((p) => {
    p.groups = groups.filter(g => g.proxyAuthId === p.id).map(g => g.name)
  })

  return proxyAuths
}

export async function getProxyAuth(id: string) {
  const proxyAuth = await db().select().table<ProxyAuth>(TABLES.PROXY_AUTH).where({ id }).first()
  if (!proxyAuth) {
    return
  }
  const groups = await db().select('name')
    .table<Group>(TABLES.GROUP)
    .innerJoin<ProxyAuthGroup>(TABLES.PROXY_AUTH_GROUP, 'proxy_auth_group.groupId', 'group.id')
    .where({ proxyAuthId: id }).orderBy(db().ref('name').withSchema(TABLES.GROUP), 'asc')
  const proxyAuthResponse: ProxyAuthResponse = { ...proxyAuth, groups: groups.map(g => g.name) }
  return proxyAuthResponse
}
