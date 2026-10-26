import { TABLES } from '@shared/db'
import type { UploadedAsset } from '@shared/db/Asset'
import type { Invitation } from '@shared/db/Invitation'
import type { User } from '@shared/db/User'
import sharp from 'sharp'
import { db } from './db'
import { createUploadedAssetFile, deleteUnreferencedAsset, getUploadedAssetWebUrl, readAsset } from './uploaded'

export async function getUploadedAssetByHash(contentHash: string) {
  return await db().select().table<UploadedAsset>(TABLES.UPLOADED_ASSET).where({ contentHash }).first()
}

async function getUserAvatarUploadedAsset(userId: string) {
  const user = await db().select('avatarHash').table<User>(TABLES.USER).where({ id: userId }).first()
  return user?.avatarHash ? await getUploadedAssetByHash(user.avatarHash) : undefined
}

async function getInvitationAvatarUploadedAsset(invitationId: string) {
  const invitation = await db().select('avatarHash').table<Invitation>(TABLES.INVITATION).where({ id: invitationId }).first()
  return invitation?.avatarHash ? await getUploadedAssetByHash(invitation.avatarHash) : undefined
}

export function getAvatarUrl(asset: UploadedAsset | undefined) {
  return asset ? getUploadedAssetWebUrl(asset.filePath) : undefined
}

export async function replaceUserAvatar(userId: string, image: Buffer, extension: string) {
  const existing = await getUserAvatarUploadedAsset(userId)
  const asset = await createUploadedAssetFile(image, extension)
  await db().table<User>(TABLES.USER).update({ avatarHash: asset.contentHash, updatedAt: new Date() }).where({ id: userId })
  if (existing && existing.contentHash !== asset.contentHash) {
    await deleteUnreferencedAsset(existing.contentHash)
  }
  return asset
}

export async function deleteUserAvatar(userId: string): Promise<void> {
  const existing = await getUserAvatarUploadedAsset(userId)
  await db().table<User>(TABLES.USER).update({ avatarHash: null, updatedAt: new Date() }).where({ id: userId })
  if (existing) {
    await deleteUnreferencedAsset(existing.contentHash)
  }
}

export async function replaceInvitationAvatar(invitationId: string, image: Buffer, extension: string) {
  const existing = await getInvitationAvatarUploadedAsset(invitationId)
  const asset = await createUploadedAssetFile(image, extension)
  await db().table<Invitation>(TABLES.INVITATION)
    .update({ avatarHash: asset.contentHash, updatedAt: new Date() }).where({ id: invitationId })
  if (existing && existing.contentHash !== asset.contentHash) {
    await deleteUnreferencedAsset(existing.contentHash)
  }
  return asset
}

export async function deleteInvitationAvatar(invitationId: string): Promise<void> {
  const existing = await getInvitationAvatarUploadedAsset(invitationId)
  await db().table<Invitation>(TABLES.INVITATION).update({ avatarHash: null, updatedAt: new Date() }).where({ id: invitationId })
  if (existing) {
    await deleteUnreferencedAsset(existing.contentHash)
  }
}

export async function transferInvitationAvatar(invitationId: string, userId: string): Promise<void> {
  const invitation = await db().table<Invitation>(TABLES.INVITATION).select('avatarHash').where({ id: invitationId }).first()
  if (!invitation?.avatarHash) {
    return
  }

  await db().table<User>(TABLES.USER).update({ avatarHash: invitation.avatarHash, updatedAt: new Date() }).where({ id: userId })
  await db().table<Invitation>(TABLES.INVITATION).update({ avatarHash: null }).where({ id: invitationId })
}

export async function getUserAvatarJpeg(userId: string) {
  const avatar = await getUserAvatarUploadedAsset(userId)
  if (!avatar) {
    return
  }
  return await sharp(await readAsset(avatar.contentHash), { limitInputPixels: 12000000 })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85 })
    .toBuffer()
}
