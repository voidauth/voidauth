import type { ClientMetadata } from 'oidc-provider'
import { db } from './db'
import { PayloadTypes, type OIDCPayload } from '@shared/db/OIDCPayload'
import appConfig from '../util/config'
import type { ClientResponse } from '@shared/api-response/ClientResponse'
import type { Group, OIDCGroup } from '@shared/db/Group'
import { decryptString } from './util'
import { TABLES } from '@shared/db'

// When getting list of clients, do not error on un-decryptable client_secret, just don't include it
export async function getClients(): Promise<ClientResponse[]> {
  const clients = (await db()
    .select<{ id: string, payload: string, groupName?: string }[]>(
      db().ref('id').withSchema(TABLES.OIDC_PAYLOADS),
      db().ref('payload').withSchema(TABLES.OIDC_PAYLOADS),
      db().ref('name').as('groupName').withSchema(TABLES.GROUP),
    )
    .table<OIDCPayload>(TABLES.OIDC_PAYLOADS)
    .leftOuterJoin<OIDCGroup>(TABLES.OIDC_GROUP, `${TABLES.OIDC_PAYLOADS}.id`, 'oidc_group.oidcId')
    .leftOuterJoin<Group>(TABLES.GROUP, 'oidc_group.groupId', 'group.id')
    .where({ type: PayloadTypes.Client })
    .orderBy(db().ref('id').withSchema(TABLES.OIDC_PAYLOADS), 'asc'))
    .reduce<ClientResponse[]>((arr, r) => {
      const existing = arr.find(a => a.client_id === r.id)
      if (existing && r.groupName) {
        existing.groups.push(r.groupName)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const c: ClientMetadata = JSON.parse(r.payload)
        if (c.client_secret) {
          const client_secret = decryptString(c.client_secret, [appConfig.STORAGE_KEY, appConfig.STORAGE_KEY_SECONDARY])
          if (client_secret) {
            c.client_secret = client_secret
          }
        }
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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const client: ClientMetadata = JSON.parse(clientDB.payload)

  if (client.client_secret) {
    const client_secret = decryptString(client.client_secret, [appConfig.STORAGE_KEY, appConfig.STORAGE_KEY_SECONDARY])
    if (client_secret) {
      client.client_secret = client_secret
    }
  }

  const groups = (await db().select('name').table<OIDCGroup>(TABLES.OIDC_GROUP)
    .leftOuterJoin<Group>(TABLES.GROUP, 'oidc_group.groupId', 'group.id')
    .where({ oidcId: client_id }))
    .map(g => g.name)
  return { ...client, groups, declared: false as const }
}
