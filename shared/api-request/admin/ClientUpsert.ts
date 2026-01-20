import type { OIDCGroup } from '@shared/db/Group'
import type { ClientMetadata, ResponseType } from 'oidc-provider'

export const RESPONSE_TYPES: ResponseType[] = ['none', 'code', 'id_token', 'code id_token',
  'id_token token', 'code token', 'code id_token token'] as const

export const UNIQUE_RESPONSE_TYPES = ['code', 'id_token', 'token', 'none'] as const

export const GRANT_TYPES = ['implicit', 'authorization_code', 'refresh_token'] as const

export type ClientUpsert = {
  post_logout_redirect_uri?: string
}
& Required<Pick<ClientMetadata,
'client_id'
| 'redirect_uris'>>
    // Optional
& Pick<ClientMetadata,
'client_secret'
| 'token_endpoint_auth_method'
| 'response_types'
| 'grant_types'
| 'logo_uri'
| 'client_name'
| 'client_uri'>
& {
  skip_consent: boolean
  require_mfa: boolean
  groups: OIDCGroup['groupId'][]
}
