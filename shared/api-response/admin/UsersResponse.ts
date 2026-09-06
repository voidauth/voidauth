import type { UserWithAdminIndicator } from '../UserDetails'
import type { Paginated } from '../Paginated'

export type UsersResponse = Paginated & {
  users: UserWithAdminIndicator[]
}
