// @ts-expect-error
import instance from "oidc-provider/lib/helpers/weak_cache"
import type { Client, ClientMetadata } from "oidc-provider"
import { db } from "./db"
import type { PayloadTypes } from "../oidc/adapter"
import { provider } from "../oidc/provider"

const clientType: PayloadTypes = "Client"

export async function getClients() {
  const clients: ClientMetadata[] = (await db.select().table("oidc_payloads").where({ type: clientType })).map((r) => {
    return JSON.parse(r.payload)
  })
  return clients
}

export async function getClient(client_id: string) {
  const client: ClientMetadata | null = JSON.parse((await db.select().table("oidc_payloads").where({ type: clientType, id: client_id }).first())?.payload ?? null)
  return client
}

export async function upsertClient(clientMetadata: ClientMetadata, ctx: any) {
  const client: Client = await instance(provider).clientAdd(clientMetadata, { ctx, store: true })
  return client
}

export async function removeClient(client_id: string) {
  const client: Client = await instance(provider).clientRemove(client_id)
  return client
}
