import type { ClientMetadata } from 'oidc-provider'

export type ClientUpsert = Required<Pick<ClientMetadata,
  'client_id'
  | 'redirect_uris'
  | 'client_secret'>>
  // Optional
  & Partial<Pick<ClientMetadata,
  'token_endpoint_auth_method'
  | 'logo_uri'
  | 'skip_consent'>>
