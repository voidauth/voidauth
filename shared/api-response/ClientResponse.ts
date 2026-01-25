import type { Group } from '@shared/db/Group'
import type { ClientMetadata } from 'oidc-provider'

export type ClientResponse = ClientMetadata & {
  skip_consent?: boolean
  require_mfa?: boolean
  groups: Group['name'][]
  declared: boolean
}
