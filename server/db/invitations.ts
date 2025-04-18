import type { Invitation } from "@shared/db/Invitation";
import { db } from "./db";
import type { InvitationDetails } from "@shared/api-response/InvitationDetails";
import type { Group, InvitationGroup } from "@shared/db/Group";
import type { Knex } from "knex";

export async function getInvitations() {
  return await db.select().table<Invitation>("invitation")
}

export async function getInvitation(id: string, trx?: Knex.Transaction) {
  const q = trx ?? db

  const invitation = await q.select().table<Invitation>("invitation").where({id}).first()
  if (!invitation) {
    return
  }
  const groups = await q.select("name")
        .table<Group>('group')
        .innerJoin<InvitationGroup>('invitation_group', "invitation_group.groupId", "group.id")
        .where({ "invitationId": id })
  const invitationDetails: InvitationDetails = { ...invitation, groups: groups.map(g => g.name) }
  return invitationDetails
}