import type { Invitation } from '@shared/db/Invitation'
import { db } from './db'
import type { InvitationDetails } from '@shared/api-response/InvitationDetails'
import type { Group, InvitationGroup } from '@shared/db/Group'
import { TABLES } from '@shared/constants'

export async function getInvitations() {
  return await db().select().table<Invitation>(TABLES.INVITATION).where('expiresAt', '>=', new Date()).orderBy('expiresAt', 'desc')
}

export async function getInvitation(id: string) {
  const invitation = await db().select().table<Invitation>(TABLES.INVITATION)
    .where({ id }).andWhere('expiresAt', '>=', new Date()).first()
  if (!invitation) {
    return
  }
  const groups = await db().select('name')
    .table<Group>(TABLES.GROUP)
    .innerJoin<InvitationGroup>(TABLES.INVITATION_GROUP, 'invitation_group.groupId', 'group.id')
    .where({ invitationId: id }).orderBy('name', 'asc')
  const invitationDetails: InvitationDetails = { ...invitation, groups: groups.map(g => g.name) }
  return invitationDetails
}
