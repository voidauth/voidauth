import type { DBColumnTypesCheck } from '@shared/db'
import type { Audit } from './Audit'

export type UploadedAsset = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  contentHash: string
  filePath: string
  byteSize: number
}

const _uploadedAssetTypeCheck: DBColumnTypesCheck<UploadedAsset> = true

export type ClientLogoAsset = Pick<Audit, 'createdAt' | 'updatedAt'> & {
  id: string
  uploadedHash: UploadedAsset['contentHash']
  clientId: string
}

const _clientLogoAssetTypeCheck: DBColumnTypesCheck<ClientLogoAsset> = true
