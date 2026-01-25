import zod from 'zod'

export const emptyString = zod.string().max(0)

export const coerceEmailOrNull = zod.union([emptyString, zod.string().trim().max(0), zod.email()]).transform(val => val || null).nullable()

export const nameValidation = zod.string().min(3).max(64).nullish()

export const passkeyRegistrationValidator = {
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
    }).optional(),
    hmacCreateSecret: zod.boolean().optional(),
  }),
  type: zod.literal('public-key'),
} as const
