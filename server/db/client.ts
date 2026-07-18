import type { ClientMetadata } from 'oidc-provider'
import { db } from './db'
import { PayloadTypes, type OIDCPayload } from '@shared/db/OIDCPayload'
import appConfig from '../util/config'
import type { ClientResponse } from '@shared/api-response/ClientResponse'
import type { Group, OIDCGroup } from '@shared/db/Group'
import { decryptString } from './util'
import { TABLES, type FoundOrNull } from '@shared/db'
import { getProviderScopeClaimCache } from './claims'

export function parseClientPayload(payload: string, options?: { strict: boolean }): ClientMetadata {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const client: ClientMetadata = JSON.parse(payload)
  // decrypt client_secret if it exists
  if (client.client_secret != null) {
    const client_secret = decryptString(client.client_secret, [appConfig.STORAGE_KEY, appConfig.STORAGE_KEY_SECONDARY])
    if (client_secret != null) {
      client.client_secret = client_secret
    } else {
      if (options?.strict) {
        throw new Error('Cannot decrypt client_secret')
      }
    }
  }
  // filter custom scopes to only those that exist in the provider (using cached)
  if (client.scope) {
    const scopes = client.scope.split(/\s+/).filter(Boolean).filter(s => getProviderScopeClaimCache().scopes.has(s))
    client.scope = scopes.join(' ')
  }
  return client
}

// When getting list of clients, do not error on un-decryptable client_secret, just don't include it
export async function getClients(): Promise<ClientResponse[]> {
  const clients = (await db()
    .select<(Pick<OIDCPayload, 'id' | 'payload'> & { groupName: FoundOrNull<Group>['name'] })[]>(
      db().ref('id').withSchema(TABLES.OIDC_PAYLOADS),
      db().ref('payload').withSchema(TABLES.OIDC_PAYLOADS),
      db().ref('name').as('groupName').withSchema(TABLES.GROUP),
    )
    .table<OIDCPayload>(TABLES.OIDC_PAYLOADS)
    .leftOuterJoin<FoundOrNull<OIDCGroup>>(TABLES.OIDC_GROUP, `${TABLES.OIDC_PAYLOADS}.id`, 'oidc_group.oidcId')
    .leftOuterJoin<FoundOrNull<Group>>(TABLES.GROUP, 'oidc_group.groupId', 'group.id')
    .where({ type: PayloadTypes.Client })
    .orderBy(db().ref('id').withSchema(TABLES.OIDC_PAYLOADS), 'asc'))
    .reduce<ClientResponse[]>((arr, r) => {
      const existing = arr.find(a => a.client_id === r.id)
      if (existing && r.groupName) {
        existing.groups.push(r.groupName)
      } else {
        const c = parseClientPayload(r.payload, { strict: false })
        const cr: ClientResponse = { ...c, groups: [] }
        if (r.groupName) {
          cr.groups.push(r.groupName)
        }
        arr.push(cr)
      }
      return arr
    }, [])
    .filter(s => !appConfig.DECLARED_CLIENTS.has(s.client_id))
    .concat(appConfig.DECLARED_CLIENTS.values().toArray())

  return clients
}

export async function getClient(client_id: string): Promise<ClientResponse | undefined> {
  const declaredClient = appConfig.DECLARED_CLIENTS.get(client_id)
  if (declaredClient != undefined) return declaredClient

  const clientDB = await db()
    .select<{ id: string, payload: string, groupName?: string }[]>(
      db().ref('id').withSchema(TABLES.OIDC_PAYLOADS),
      db().ref('payload').withSchema(TABLES.OIDC_PAYLOADS),
    )
    .table<OIDCPayload>(TABLES.OIDC_PAYLOADS)
    .where({ type: PayloadTypes.Client, id: client_id })
    .first()

  if (!clientDB) {
    return
  }

  const client: ClientMetadata = parseClientPayload(clientDB.payload, { strict: false })

  const groups = (await db().select('name').table<OIDCGroup>(TABLES.OIDC_GROUP)
    .innerJoin<Group>(TABLES.GROUP, 'oidc_group.groupId', 'group.id')
    .where({ oidcId: client_id }))
    .map(g => g.name)
  return { ...client, groups, declared: false as const }
}
