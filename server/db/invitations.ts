import type { Invitation } from '@shared/db/Invitation'
import { db } from './db'
import type { InvitationDetails } from '@shared/api-response/admin/InvitationDetails'
import type { Group, InvitationGroup } from '@shared/db/Group'
import { TABLES } from '@shared/db'
import type { CustomClaim, InvitationCustomClaim } from '@shared/db/CustomClaim'

export async function getInvitations() {
  return await db().select().table<Invitation>(TABLES.INVITATION)
    .where(db().ref('expiresAt').withSchema(TABLES.INVITATION), '>=', new Date())
    .orderBy(db().ref('expiresAt').withSchema(TABLES.INVITATION), 'desc')
}

export async function getInvitation(id: string) {
  return await db().select().table<Invitation>(TABLES.INVITATION)
    .where({ id }).andWhere(db().ref('expiresAt').withSchema(TABLES.INVITATION), '>=', new Date()).first()
}

export async function getInvitationDetails(id: string) {
  const invitation = await getInvitation(id)
  if (!invitation) {
    return
  }
  const groups = await db().select('name')
    .table<Group>(TABLES.GROUP)
    .innerJoin<InvitationGroup>(TABLES.INVITATION_GROUP, 'invitation_group.groupId', 'group.id')
    .where({ invitationId: id }).orderBy(db().ref('name').withSchema(TABLES.GROUP), 'asc')
  const customClaims = await db().select('claim', 'value')
    .table<InvitationCustomClaim>(TABLES.INVITATION_CUSTOM_CLAIM)
    .innerJoin<CustomClaim>(TABLES.CUSTOM_CLAIM, 'invitation_custom_claim.claimId', 'custom_claim.id')
    .where({ invitationId: id })
  const invitationDetails: InvitationDetails = { ...invitation, groups: groups.map(g => g.name), customClaims }
  return invitationDetails
}
