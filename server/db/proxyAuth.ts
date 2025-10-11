import { db } from './db'
import type { Group, ProxyAuthGroup } from '@shared/db/Group'
import type { ProxyAuth } from '@shared/db/ProxyAuth'
import { sortWildcardDomains } from '@shared/utils'
import type { ProxyAuthResponse } from '@shared/api-response/admin/ProxyAuthResponse'
import { TABLES } from '@shared/constants'

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
    .where({ proxyAuthId: id }).orderBy('name', 'asc')
  const proxyAuthResponse: ProxyAuthResponse = { ...proxyAuth, groups: groups.map(g => g.name) }
  return proxyAuthResponse
}
