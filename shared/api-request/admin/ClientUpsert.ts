import type { ClientMetadata } from 'oidc-provider'

export type ClientUpsert = Required<Pick<ClientMetadata, 'client_id'
  | 'redirect_uris'
  | 'client_secret'
  | 'token_endpoint_auth_method'>>
