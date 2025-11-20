import type { GroupUsers } from '@shared/api-response/admin/GroupUsers'
import type { Group } from '@shared/db/Group'

export type GroupUpsert = Partial<Pick<Group, 'id'>> & Pick<Group, 'name' | 'mfaRequired'> & {
  users: GroupUsers['users']
}
