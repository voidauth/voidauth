import type { Audit } from "./Audit"
import type { Invitation } from "./Invitation"
import type { User } from "./User"
import type { ForwardAuthDomain } from "./ForwardAuthDomain"

export type Group = Audit & {
  id: string
  name: string
}

export type UserGroup = Audit & {
  userId: User["id"]
  groupId: Group["id"]
}

export type InvitationGroup = Audit & {
  invitationId: Invitation["id"]
  groupId: Group["id"]
}

export type ForwardAuthDomainGroup = Audit & {
  forwardAuthId: ForwardAuthDomain["id"]
  groupId: Group["id"]
}
