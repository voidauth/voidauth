import type { Group } from '../..//db/Group'
import type { User } from '../../db/User'

export type GroupUsers = Group & {
  users: {
    id: User['id']
    username: User['username']
  }[]
}
