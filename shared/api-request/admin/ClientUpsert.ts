import type { ClientMetadata, ResponseType } from 'oidc-provider'

export const RESPONSE_TYPES: ResponseType[] = ['none', 'code', 'id_token', 'code id_token',
  'id_token token', 'code token', 'code id_token token'] as const

export const UNIQUE_RESPONSE_TYPES = ['code', 'id_token', 'token'] as const

export const GRANT_TYPES = ['implicit', 'authorization_code', 'refresh_token'] as const

export type ClientUpsert = Required<Pick<ClientMetadata,
  'client_id'
  | 'redirect_uris'
  | 'client_secret'>>
  // Optional
  & Partial<Pick<ClientMetadata,
  'token_endpoint_auth_method'
  | 'response_types'
  | 'grant_types'
  | 'logo_uri'
  | 'skip_consent'>>
