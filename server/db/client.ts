import type { Client, ClientMetadata, Provider } from "oidc-provider"
import { db } from "./db"
import { provider } from "../oidc/provider"
import add from "oidc-provider/lib/helpers/add_client"
import type { OIDCPayload, PayloadType } from "@shared/db/OIDCPayload"
import { decryptString } from "./key"
import appConfig from "../util/config"

const clientType: PayloadType = "Client"

// When getting list of clients, do not error on un-decryptable client_secret, just don't include it
export async function getClients() {
  const clients = (await db()
    .select()
    .table<OIDCPayload>("oidc_payloads")
    .where({ type: clientType })
    .orderBy("id", "asc"))
    .reduce<ClientMetadata[]>((p, r) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const c: ClientMetadata = JSON.parse(r.payload)
      if (c.client_secret) {
        const client_secret = decryptString(c.client_secret, [appConfig.STORAGE_KEY, appConfig.STORAGE_KEY_SECONDARY])
        if (client_secret) {
          c.client_secret = client_secret
          p.push(c)
        }
      } else {
        // If a client is missing a client_secret entirely, include it
        p.push(c)
      }

      return p
    }, [])
  return clients
}

export async function getClient(client_id: string) {
  // @ts-expect-error client adapter actually does exist
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  return await provider.Client.adapter.find(client_id) as ClientMetadata | undefined
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
