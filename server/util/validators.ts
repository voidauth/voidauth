import zod from 'zod'
import { passwordStrength } from './zxcvbn'
import appConfig from './config'
import type { SchemaShape } from './validate'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import type { NextFunction, Request, Response } from 'express'
import { isAdmin } from '@shared/user'

export function checkPrivileged(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.user.isPrivileged) {
    res.sendStatus(401)
    return
  }
  next()
}

export function checkAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req.user)) {
    res.sendStatus(403)
    return
  }
  next()
}

export const emptyString = zod.string().max(0)

export const coerceEmailOrNull = zod.union([emptyString, zod.string().trim().max(0), zod.email()]).transform(val => val || null).nullable()

export const nameValidation = zod.string().min(3).max(64).nullish()

export const newPasswordValidation = zod.string().refine((val) => {
  return passwordStrength(val).score >= appConfig.PASSWORD_STRENGTH
})

export const passkeyRegistrationValidator: SchemaShape<RegistrationResponseJSON> = {
  id: zod.string(),
  rawId: zod.string(),
  response: zod.object({
    clientDataJSON: zod.string(),
    attestationObject: zod.string(),
    authenticatorData: zod.string().optional(),
    transports: zod.array(zod.enum(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'])).optional(),
    publicKeyAlgorithm: zod.number().optional(),
    publicKey: zod.string().optional(),
  }),
  authenticatorAttachment: zod.enum(['cross-platform', 'platform']).optional(),
  clientExtensionResults: zod.object({
    appid: zod.boolean().optional(),
    credProps: zod.object({
      rk: zod.boolean().optional(),
    }),
    hmacCreateSecret: zod.boolean().optional(),
  }),
  type: zod.literal('public-key'),
} as const
