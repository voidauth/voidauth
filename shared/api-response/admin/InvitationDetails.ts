import type { Group } from '@shared/db/Group'
import type { Invitation } from '@shared/db/Invitation'

export type InvitationDetails = Invitation & {
  groups: {
    id: Group['id']
    name: Group['name']
    customClaims: {
      claim: string
      value: string
    }[]
  }[]
  customClaims: {
    claim: string
    value: string
  }[]
}
