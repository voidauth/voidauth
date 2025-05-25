import type { Audit } from "./Audit"
import type { Invitation } from "./Invitation"
import type { User } from "./User"
import type { ProxyAuth } from "./ProxyAuth"

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

export type ProxyAuthGroup = Audit & {
  proxyAuthId: ProxyAuth["id"]
  groupId: Group["id"]
}
