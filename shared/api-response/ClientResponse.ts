import type { Group } from '@shared/db/Group'
import type { ClientMetadata } from 'oidc-provider'

export type ClientResponse = ClientMetadata & {
  groups: Group['name'][]
  declared: boolean
}
