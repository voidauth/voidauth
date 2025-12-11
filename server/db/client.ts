import type { Client, ClientMetadata, Provider } from 'oidc-provider'
import { db } from './db'
import { getProviderClient, provider } from '../oidc/provider'
import add from 'oidc-provider/lib/helpers/add_client.js'
import type { OIDCPayload, PayloadType } from '@shared/db/OIDCPayload'
import appConfig from '../util/config'
import type { ClientResponse } from '@shared/api-response/ClientResponse'
import type { Group, OIDCGroup } from '@shared/db/Group'
import type { User } from '@shared/db/User'
import { decryptString, mergeKeys } from './util'
import { TABLES } from '@shared/constants'

const CLIENT_TYPE: PayloadType = 'Client'

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
    .where({ type: CLIENT_TYPE })
    .orderBy(`${TABLES.OIDC_PAYLOADS}.id`, 'asc'))
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
  return clients
}

export async function getClient(client_id: string): Promise<ClientResponse | undefined> {
  return getProviderClient(client_id)
}

export async function upsertClient(provider: Provider, clientMetadata: ClientResponse, user: Pick<User, 'id'>, ctx: unknown) {
  const { groups, ...metadata } = clientMetadata
  const client: Client = await add(provider, metadata, { ctx, store: true })
  const clientId = client.clientId
  const clientGroups: OIDCGroup[] = (await db().select().table<Group>(TABLES.GROUP).whereIn('name', groups)).map((g) => {
    return {
      groupId: g.id,
      oidcId: clientId,
      oidcType: CLIENT_TYPE,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  })
  if (clientGroups[0]) {
    await db().table<OIDCGroup>(TABLES.OIDC_GROUP).insert(clientGroups)
      .onConflict(['groupId', 'oidcId', 'oidcType']).merge(mergeKeys(clientGroups[0]))
  }

  await db().table<OIDCGroup>(TABLES.OIDC_GROUP).delete()
    .where({ oidcId: clientId }).and
    .whereNotIn('groupId', clientGroups.map(g => g.groupId))

  return client
}

export async function removeClient(client_id: string) {
  // @ts-expect-error client adapter actually does exist
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  await provider.Client.adapter.destroy(client_id)
}
