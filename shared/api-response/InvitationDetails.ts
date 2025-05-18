import type { Group } from "@shared/db/Group"
import type { Invitation } from "@shared/db/Invitation"

export type InvitationDetails = Invitation & {
  groups: Group["name"][]
}
