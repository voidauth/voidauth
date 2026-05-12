import type { Invitation } from '@shared/db/Invitation'
import { db } from './db'
import type { InvitationDetails } from '@shared/api-response/InvitationDetails'
import type { Group, InvitationGroup } from '@shared/db/Group'
import { TABLES } from '@shared/db'

export async function getInvitations() {
  return await db().select().table<Invitation>(TABLES.INVITATION)
    .where(db().ref('expiresAt').withSchema(TABLES.INVITATION), '>=', new Date())
    .orderBy(db().ref('expiresAt').withSchema(TABLES.INVITATION), 'desc')
}

export async function getInvitation(id: string) {
  const invitation = await db().select().table<Invitation>(TABLES.INVITATION)
    .where({ id }).andWhere(db().ref('expiresAt').withSchema(TABLES.INVITATION), '>=', new Date()).first()
  if (!invitation) {
    return
  }
  const groups = await db().select('name')
    .table<Group>(TABLES.GROUP)
    .innerJoin<InvitationGroup>(TABLES.INVITATION_GROUP, 'invitation_group.groupId', 'group.id')
    .where({ invitationId: id }).orderBy(db().ref('name').withSchema(TABLES.GROUP), 'asc')
  const invitationDetails: InvitationDetails = { ...invitation, groups: groups.map(g => g.name) }
  return invitationDetails
}
