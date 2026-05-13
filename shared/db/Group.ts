import type { Audit } from './Audit'
import type { Invitation } from './Invitation'
import type { User } from './User'
import type { ProxyAuth } from './ProxyAuth'
import type { OIDCPayload } from './OIDCPayload'
import type { DBColumnTypesCheck } from '@shared/db'

export type Group = Audit & {
  id: string
  name: string
  mfaRequired: boolean | number
  autoAssign: boolean | number
}

const _typeCheck: DBColumnTypesCheck<Group> = true

export type UserGroup = Audit & {
  userId: User['id']
  groupId: Group['id']
}

export type InvitationGroup = Audit & {
  invitationId: Invitation['id']
  groupId: Group['id']
}

export type ProxyAuthGroup = Audit & {
  proxyAuthId: ProxyAuth['id']
  groupId: Group['id']
}

export type OIDCGroup = Audit & {
  oidcId: OIDCPayload['id']
  oidcType: OIDCPayload['type']
  groupId: Group['id']
}
