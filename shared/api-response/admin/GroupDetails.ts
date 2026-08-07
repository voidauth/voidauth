import type { Group } from '../../db/Group'
import type { User } from '../../db/User'

export type GroupDetails = Group & {
  users: {
    id: User['id']
    username: User['username']
  }[]
  customClaims: {
    claim: string
    value: string
  }[]
}
