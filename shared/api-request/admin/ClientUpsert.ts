import { isValidWildcardRedirect, type SchemaInfer } from '@shared/utils'
import { emptyString } from '@shared/validators'
import type { ClientAuthMethod, ResponseType } from 'oidc-provider'
import zod from 'zod'

export const RESPONSE_TYPES = ['none', 'code', 'id_token', 'code id_token',
  'id_token token', 'code token', 'code id_token token'] as const satisfies ResponseType[]

export const UNIQUE_RESPONSE_TYPES = ['code', 'id_token', 'token', 'none'] as const

export const GRANT_TYPES = ['implicit', 'authorization_code', 'refresh_token'] as const

export const CLIENT_AUTH_METHODS = [
  'client_secret_basic',
  'client_secret_post',
  'client_secret_jwt',
  'none'] as const satisfies ClientAuthMethod[]

export const clientUpsertValidator = {
  client_id: zod.string().min(1).trim(),
  client_name: zod.string().trim().transform(v => v || undefined).optional(),
  redirect_uris: zod.array(zod.string().trim().refine((input) => {
    return typeof input === 'string' && isValidWildcardRedirect(input)
  })),
  post_logout_redirect_uri: zod.string().trim().refine((input) => {
    return typeof input === 'string' && isValidWildcardRedirect(input)
  }).optional(),
  client_secret: zod.string().trim().transform(v => v || undefined).optional(),
  token_endpoint_auth_method: zod.enum(CLIENT_AUTH_METHODS).optional(),
  response_types: zod.array(zod.enum(RESPONSE_TYPES)).optional(),
  grant_types: zod.array(zod.enum(GRANT_TYPES)).optional(),
  skip_consent: zod.boolean(),
  require_mfa: zod.boolean(),
  logo_uri: zod.union([zod.url().trim(), emptyString]).transform(v => v || undefined).optional(),
  client_uri: zod.union([zod.url().trim(), emptyString]).transform(v => v || undefined).optional(),
  groups: zod.array(zod.string().trim().min(1)),
}

export type ClientUpsert = SchemaInfer<typeof clientUpsertValidator>
