import type { Client, ClientMetadata, Provider } from 'oidc-provider'
import { db } from './db'
import { provider } from '../oidc/provider'
import add from 'oidc-provider/lib/helpers/add_client'
import type { OIDCPayload, PayloadType } from '@shared/db/OIDCPayload'
import { decryptKeyString } from './key'
import { isEncryptedData } from '@shared/db/Key'
import appConfig from '../util/config'

const clientType: PayloadType = 'Client'

export function decryptClient(client_stringified: string) {
  const client: unknown = JSON.parse(client_stringified)
  if (typeof client === 'object'
    && client != null
    && 'client_secret' in client
    && isEncryptedData(client.client_secret)) {
    client.client_secret = decryptKeyString(client.client_secret.value,
      client.client_secret.metadata,
      [appConfig.STORAGE_KEY, appConfig.STORAGE_KEY_SECONDARY])
    ?? undefined
  }

  return client
}

export async function getClients() {
  const clients = (await db()
    .select()
    .table<OIDCPayload>('oidc_payloads')
    .where({ type: clientType }))
    .map((r) => {
      return decryptClient(r.payload)
    })
  return clients
}

export async function getClient(client_id: string) {
  const client = decryptClient((await db()
    .select()
    .table<OIDCPayload>('oidc_payloads')
    .where({ type: clientType, id: client_id })
    .first())?.payload ?? 'null')
  return client
}

export async function upsertClient(provider: Provider, clientMetadata: ClientMetadata, ctx: unknown) {
  const client: Client = await add(provider, clientMetadata, { ctx, store: true })
  return client
}

export async function removeClient(client_id: string) {
  // @ts-expect-error client adapter actually does exist
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  await provider.Client.adapter.destroy(client_id)
}
