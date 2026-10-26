import type { RequestHandler } from 'express'
import type { Request } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import appConfig from './config'

export async function normalizeUploadedImage(buffer: Buffer): Promise<{ buffer: Buffer, extension: string }> {
  const image = sharp(buffer, { limitInputPixels: 12000000 })
  const metadata = await image.metadata()
  const expectedFormats = ['png', 'jpeg', 'webp']
  if (typeof metadata.format !== 'string' || !expectedFormats.includes(metadata.format)
    || !metadata.width || !metadata.height
    || (metadata.width * metadata.height) > 12000000) {
    throw new Error('Unsupported or excessive image dimensions.')
  }

  const data = await image
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .toBuffer()
  if (data.byteLength > (4 * 1024 * 1024)) {
    throw new Error('Normalized image exceeds the output limit of 4 MB.')
  }
  return { buffer: data, extension: metadata.format }
}

// Have to get funky with the typing to be ok with zodValidator inputs
export function imageUpload(fieldName: 'avatar' | 'logo', actor: 'user' | 'admin'): RequestHandler<unknown, unknown, unknown, unknown>[] {
  return [
    (req, res, next) => {
      if (appConfig.DISABLE_FILE_UPLOADS) {
        res.sendStatus(404)
        return
      }

      const user = req.user
      if (user?.isAdmin) {
        actor = 'admin'
      }

      if (fieldName === 'avatar' && actor === 'user' && appConfig.DISABLE_USER_AVATAR_UPLOADS) {
        res.sendStatus(404)
        return
      }
      next()
    },
    (req, res, next) => {
      multer({
        storage: multer.memoryStorage(),
        // limit input file to 2MB
        limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1, headerPairs: 32 },
      }).single(fieldName)(req as unknown as Request, res, (error) => {
        if (error) {
          const isTooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
          res.status(isTooLarge ? 413 : 400).send({
            message: isTooLarge ? `${fieldName} file exceeds 2 MB.` : `Invalid ${fieldName.toLowerCase()} upload.`,
          })
          return
        }
        next()
      })
    },
  ]
}
