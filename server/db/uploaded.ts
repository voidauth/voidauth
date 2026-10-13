import { TABLES } from '@shared/db'
import { createHash, randomBytes } from 'node:crypto'
import * as fs from 'node:fs'
import path from 'node:path'
import { db } from './db'
import type { ClientLogoAsset, UploadedAsset } from '@shared/db/Asset'
import { appUrl } from '../util/config'

const uploadsPath = path.resolve('./config/uploads')
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, {
    recursive: true,
  })
}

function generateFilePath(contentHash: string, extension: string) {
  if (!/^[a-z0-9]+$/.test(extension)) {
    throw new Error('Invalid asset extension.')
  }
  // random hex string to randomize filename
  const rando = randomBytes(16).toString('hex')
  return path.join(contentHash.slice(0, 2), contentHash, `${rando}.${extension}`)
}

function uploadAssetWebPath(filePath: string) {
  return `/assets/uploads/${filePath.replaceAll('\\', '/')}`
}

export function getUploadedAssetWebUrl(filePath: string) {
  return `${appUrl().href}${uploadAssetWebPath(filePath)}`
}

function uploadedStoragePath(filePath: string) {
  const resolved = path.join(uploadsPath, filePath)
  if (resolved === uploadsPath || !resolved.startsWith(`${uploadsPath}${path.sep}`)) {
    throw new Error('Invalid uploaded asset file path.')
  }
  return resolved
}

/**
 * Gets an uploaded asset by its content hash.
 * Will remove asset record if uploaded file is missing or doesn't match
 * @param contentHash
 */
async function ensureRecordFileConsistent(contentHash: string) {
  const existingRecord = await db().select().table<UploadedAsset>(TABLES.UPLOADED_ASSET).where({ contentHash }).first()
  const existingFileExists = (() => {
    try {
      return existingRecord && fs.existsSync(uploadedStoragePath(existingRecord.filePath))
    } catch {
      return false
    }
  })()

  if (existingRecord && !existingFileExists) {
    // File is missing, but record exists. Remove the record.
    await db().delete().table<UploadedAsset>(TABLES.UPLOADED_ASSET).where({ contentHash })
    return
  }

  return existingRecord
}

export async function createUploadedAssetFile(data: Buffer, extension: string) {
  const contentHash = createHash('sha256').update(data).digest('hex')

  // need to check for consistency for this content hash between db and filesystem
  const existingRecord = await ensureRecordFileConsistent(contentHash)

  if (!existingRecord) {
    // ensure file record exists in db.
    const filePath = generateFilePath(contentHash, extension)
    const upsertAsset: UploadedAsset = {
      contentHash,
      filePath,
      byteSize: data.byteLength,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const record = await db().table<UploadedAsset>(TABLES.UPLOADED_ASSET).insert(upsertAsset).returning('*')

    if (!record[0]) {
      throw new Error('Failed to create uploaded asset.')
    }

    const targetPath = uploadedStoragePath(filePath)
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })

    // write file
    try {
      fs.writeFileSync(targetPath, data, { flag: 'w', mode: 0o600 })
    } catch (error) {
      fs.rmSync(targetPath, { force: true })
      throw error
    }

    return record[0]
  }

  return existingRecord
}

export async function readAsset(contentHash: string) {
  const record = await db().select().table<UploadedAsset>(TABLES.UPLOADED_ASSET).where({ contentHash }).first()
  if (!record) {
    throw new Error('Asset record not found.')
  }
  return fs.readFileSync(uploadedStoragePath(record.filePath))
}

export async function deleteUnreferencedAsset(contentHash: string) {
  // Check if uploaded asset is unreferenced by tables that would
  if (await db().select().table<ClientLogoAsset>(TABLES.CLIENT_LOGO_ASSET).where({ uploadedHash: contentHash }).first()) {
    return
  }
  await deleteAsset(contentHash)
}

async function deleteAsset(contentHash: string) {
  const record = await db().select().table<UploadedAsset>(TABLES.UPLOADED_ASSET).where({ contentHash }).first()
  if (!record) {
    throw new Error('Asset record not found.')
  }
  fs.rmSync(uploadedStoragePath(record.filePath), { force: true })
  await db().delete().table<UploadedAsset>(TABLES.UPLOADED_ASSET).where({ contentHash })
}
