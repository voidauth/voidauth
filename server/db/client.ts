import type { Client, ClientMetadata, Provider } from 'oidc-provider'
import { db } from './db'
import type { PayloadTypes } from '../oidc/adapter'
import { provider } from '../oidc/provider'
import add from 'oidc-provider/lib/helpers/add_client'

const clientType: PayloadTypes = 'Client'

export async function getClients() {
  const clients: ClientMetadata[] = (await db()
    .select()
    .table<{ payload: string, type: typeof clientType, id: string }>('oidc_payloads')
    .where({ type: clientType }))
    .map((r) => {
      return JSON.parse(r.payload) as ClientMetadata
    })
  return clients
}

export async function getClient(client_id: string) {
  const client: ClientMetadata | null = JSON.parse((await db()
    .select()
    .table<{ payload: string, type: typeof clientType, id: string }>('oidc_payloads')
    .where({ type: clientType, id: client_id })
    .first())?.payload ?? 'null') as ClientMetadata | null
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
