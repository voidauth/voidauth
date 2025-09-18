import type { Client, ClientMetadata, Provider } from 'oidc-provider'
import { db } from './db'
import { provider } from '../oidc/provider'
import add from 'oidc-provider/lib/helpers/add_client'
import type { OIDCPayload, PayloadType } from '@shared/db/OIDCPayload'
import { decryptString } from './key'
import appConfig from '../util/config'
import type { ClientResponse } from '@shared/api-response/ClientResponse'
import type { Group, OIDCGroup } from '@shared/db/Group'
import type { User } from '@shared/db/User'
import { mergeKeys } from './util'

const CLIENT_TYPE: PayloadType = 'Client'

// When getting list of clients, do not error on un-decryptable client_secret, just don't include it
export async function getClients(): Promise<ClientResponse[]> {
  const clients = (await db()
    .select<{ id: string, payload: string, groupName?: string }[]>(
      db().ref('id').withSchema('oidc_payloads'),
      db().ref('payload').withSchema('oidc_payloads'),
      db().ref('name').as('groupName').withSchema('group'),
    )
    .table<OIDCPayload>('oidc_payloads')
    .leftOuterJoin<OIDCGroup>('oidc_group', 'oidc_payloads.id', 'oidc_group.oidcId')
    .leftOuterJoin<Group>('group', 'oidc_group.groupId', 'group.id')
    .where({ type: CLIENT_TYPE })
    .orderBy('id', 'asc'))
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
  const client = (await provider.Client.find(client_id))?.metadata()
  if (!client) {
    return
  }
  const groups = (await db().select('name').table<OIDCGroup>('oidc_group')
    .leftOuterJoin<Group>('group', 'oidc_group.groupId', 'group.id')
    .where({ oidcId: client_id }))
    .map(g => g.name)
  return { ...client, groups }
}

export async function upsertClient(provider: Provider, clientMetadata: ClientResponse, user: Pick<User, 'id'>, ctx: unknown) {
  const { groups, ...metadata } = clientMetadata
  const client: Client = await add(provider, metadata, { ctx, store: true })
  const clientId = client.clientId
  const clientGroups: OIDCGroup[] = (await db().select().table<Group>('group').whereIn('name', groups)).map((g) => {
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
    await db().table<OIDCGroup>('oidc_group').insert(clientGroups)
      .onConflict(['groupId', 'oidcId', 'oidcType']).merge(mergeKeys(clientGroups[0]))
  }

  await db().table<OIDCGroup>('oidc_group').delete()
    .where({ oidcId: clientId }).and
    .whereNotIn('groupId', clientGroups.map(g => g.groupId))

  return client
}

export async function removeClient(client_id: string) {
  // @ts-expect-error client adapter actually does exist
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  await provider.Client.adapter.destroy(client_id)
}
