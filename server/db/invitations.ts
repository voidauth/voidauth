import type { Invitation } from "@shared/db/Invitation"
import { db } from "./db"
import type { InvitationDetails } from "@shared/api-response/InvitationDetails"
import type { Group, InvitationGroup } from "@shared/db/Group"

export async function getInvitations() {
  return await db().select().table<Invitation>("invitation").where("expiresAt", ">=", new Date())
}

export async function getInvitation(id: string) {
  const invitation = await db().select().table<Invitation>("invitation")
    .where({ id }).andWhere("expiresAt", ">=", new Date()).first()
  if (!invitation) {
    return
  }
  const groups = await db().select("name")
    .table<Group>("group")
    .innerJoin<InvitationGroup>("invitation_group", "invitation_group.groupId", "group.id")
    .where({ invitationId: id })
  const invitationDetails: InvitationDetails = { ...invitation, groups: groups.map(g => g.name) }
  return invitationDetails
}
