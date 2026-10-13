import type { ClientMetadata } from 'oidc-provider'
import { db } from './db'
import { PayloadTypes, type OIDCPayload } from '@shared/db/OIDCPayload'
import type { Group, OIDCGroup } from '@shared/db/Group'
import { mergeKeys } from './util'
import { TABLES } from '@shared/db'
import type { DeepWritable } from '@shared/utils'
import type { ClientLogoAsset } from '@shared/db/Asset'
import { randomUUID } from 'node:crypto'
import { createUploadedAssetFile, deleteUnreferencedAsset } from './uploaded'
import { provider } from '../oidc/provider'
import add from 'oidc-provider/lib/helpers/add_client.js'
import type { User } from '@shared/db/User'
import { getClientLogoUploadedAsset, parseClientPayload } from './client_get'

export async function upsertClientMetadataOnly(metadata: DeepWritable<ClientMetadata>, ctx: unknown) {
  await provider().Client.validate(metadata)
  const client = await add(provider(), metadata, { ctx, store: true })
  await provider().Client.validate(client.metadata())
  return client
}

export async function upsertClient(metadata: DeepWritable<ClientMetadata>, groups: string[], user: Pick<User, 'id'>, ctx: unknown) {
  const client = await upsertClientMetadataOnly(metadata, ctx)
  const clientId = client.clientId

  // Sync groups for the client
  const clientGroups: OIDCGroup[] = (await db().select().table<Group>(TABLES.GROUP).whereIn('name', groups)).map((g) => {
    return {
      groupId: g.id,
      oidcId: clientId,
      oidcType: PayloadTypes.Client,
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
  const clientLogoAsset = await getClientLogoUploadedAsset(client_id)
  // @ts-expect-error client adapter actually does exist
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  await provider().Client.adapter.destroy(client_id)
  if (clientLogoAsset) {
    // do last, cannot be undone
    await deleteUnreferencedAsset(clientLogoAsset.contentHash)
  }
}

export async function replaceClientLogo(clientId: string, image: Buffer, extension: string) {
  const existing = await getClientLogoUploadedAsset(clientId)
  const asset = await createUploadedAssetFile(image, extension)

  const clientLogo: ClientLogoAsset = {
    id: randomUUID(),
    uploadedHash: asset.contentHash,
    clientId: clientId,
    createdAt: existing?.createdAt ?? new Date(),
    updatedAt: new Date(),
  }
  await db().table<ClientLogoAsset>(TABLES.CLIENT_LOGO_ASSET)
    .insert(clientLogo)
    .onConflict(['clientId'])
    .merge(mergeKeys(clientLogo))
  if (existing && existing.contentHash !== asset.contentHash) {
    await deleteUnreferencedAsset(existing.contentHash)
  }

  // Remove client logo uri from client metadata, it will be generated instead
  const oidcPayload = await db().select().table<OIDCPayload>(TABLES.OIDC_PAYLOADS).where({ id: clientId }).first()
  if (oidcPayload) {
    const metadata = parseClientPayload(oidcPayload.payload, { strict: true, logoPath: null })
    metadata.logo_uri = undefined
    await upsertClientMetadataOnly(metadata, undefined)
  }

  return asset
}

export async function deleteClientLogo(clientId: string): Promise<void> {
  const existing = await getClientLogoUploadedAsset(clientId)
  await db().table<ClientLogoAsset>(TABLES.CLIENT_LOGO_ASSET).delete().where({
    clientId: clientId,
  })
  if (existing) {
    await deleteUnreferencedAsset(existing.contentHash)
  }
}
