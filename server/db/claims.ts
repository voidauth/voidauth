import { TABLES } from '@shared/db'
import { db } from './db'
import type { CustomClaim, GroupCustomClaim, InvitationCustomClaim, UserCustomClaim } from '@shared/db/CustomClaim'
import { PROTECTED_CLAIMS, PROTECTED_CLAIMS_SET, PROTECTED_SCOPES } from '@shared/constants'
import type { CustomClaimDetails } from '@shared/api-response/admin/CustomClaimDetails'
import type { User } from '@shared/db/User'
import type { Group } from '@shared/db/Group'
import type { Invitation } from '@shared/db/Invitation'
import type { AdminConfig } from '@shared/api-response/admin/AdminConfig'
import type { ItemIn } from '@shared/utils'

const defaultClaims = {
  // OIDC 1.0 Standard
  // address: ['address'],
  email: ['email', 'email_verified'],
  // phone: ['phone_number', 'phone_number_verified'],
  profile: [
    // 'birthdate',
    // 'family_name',
    // 'gender',
    // 'given_name',
    // 'locale',
    // 'middle_name',
    'name',
    // 'nickname',
    // 'picture',
    'preferred_username',
    // 'profile',
    // 'updated_at',
    // 'website',
    // 'zoneinfo'
  ],

  // Additional
  groups: ['groups'],
} as const satisfies Partial<Record<typeof PROTECTED_SCOPES[number], (typeof PROTECTED_CLAIMS[number])[]>>

export async function getCustomClaimsRecords(): Promise<CustomClaim[]> {
  const claims = (await db().select()
    .table<CustomClaim>(TABLES.CUSTOM_CLAIM))
    .filter(c => !PROTECTED_CLAIMS_SET.has(c.claim))

  return claims
}

export async function getCustomClaims(): Promise<string[]> {
  return (await getCustomClaimsRecords()).map(c => c.claim)
}

export async function getAllClaims(): Promise<Record<string, string[]>> {
  return {
    ...defaultClaims,
    openid: (await getCustomClaims()),
  }
}

export async function getUserCustomClaims(userId: string) {
  const claims = (await db()
    .select('claim', 'value')
    .table<CustomClaim>(TABLES.CUSTOM_CLAIM)
    .innerJoin<UserCustomClaim>(TABLES.USER_CUSTOM_CLAIM, `${TABLES.CUSTOM_CLAIM}.id`, `${TABLES.USER_CUSTOM_CLAIM}.claimId`)
    .where({ userId }).orderBy(db().ref('claim').withSchema(TABLES.CUSTOM_CLAIM), 'asc'))
  return claims
}

export async function getGroupsCustomClaims(groups: Pick<Group, 'id' | 'name'>[]): Promise<AdminConfig['defaultGroups']> {
  if (groups.length === 0) {
    return []
  }
  const groupsWithCustomClaims = (await db().select(
    db().ref('groupId').withSchema(TABLES.GROUP_CUSTOM_CLAIM),
    db().ref('claim').withSchema(TABLES.CUSTOM_CLAIM),
    db().ref('value').withSchema(TABLES.GROUP_CUSTOM_CLAIM),
  )
    .table<GroupCustomClaim>(TABLES.GROUP_CUSTOM_CLAIM)
    .innerJoin<CustomClaim>(TABLES.CUSTOM_CLAIM, `${TABLES.GROUP_CUSTOM_CLAIM}.claimId`, `${TABLES.CUSTOM_CLAIM}.id`)
    .whereIn('groupId', groups.map(g => g.id)))
    .reduce((acc, gc) => {
      const group = acc.find(g => g.id === gc.groupId)
      if (group) {
        group.customClaims.push({ claim: gc.claim, value: gc.value })
      }
      return acc
    }, groups.map<ItemIn<AdminConfig['defaultGroups']>>(g => ({ id: g.id, name: g.name, customClaims: [] })))
  return groupsWithCustomClaims
}

export async function getCustomClaimDetails(claimId: string): Promise<CustomClaimDetails | undefined> {
  const claim = await db().select().table<CustomClaim>(TABLES.CUSTOM_CLAIM).where({ id: claimId }).first()
  if (!claim) {
    return undefined
  }
  const users = await db().select(db().ref('id').withSchema(TABLES.USER), 'username', 'value')
    .table<CustomClaim>(TABLES.CUSTOM_CLAIM)
    .innerJoin<UserCustomClaim>(TABLES.USER_CUSTOM_CLAIM, `${TABLES.CUSTOM_CLAIM}.id`, `${TABLES.USER_CUSTOM_CLAIM}.claimId`)
    .innerJoin<User>(TABLES.USER, `${TABLES.USER_CUSTOM_CLAIM}.userId`, `${TABLES.USER}.id`)
    .where({ claimId }).orderBy(db().ref('username').withSchema(TABLES.USER), 'asc')

  const groups = await db().select(db().ref('id').withSchema(TABLES.GROUP), 'name', 'value')
    .table<CustomClaim>(TABLES.CUSTOM_CLAIM)
    .innerJoin<GroupCustomClaim>(TABLES.GROUP_CUSTOM_CLAIM, `${TABLES.CUSTOM_CLAIM}.id`, `${TABLES.GROUP_CUSTOM_CLAIM}.claimId`)
    .innerJoin<Group>(TABLES.GROUP, `${TABLES.GROUP_CUSTOM_CLAIM}.groupId`, `${TABLES.GROUP}.id`)
    .where({ claimId }).orderBy(db().ref('name').withSchema(TABLES.GROUP), 'asc')

  const invitations = await db().select(db().ref('id').withSchema(TABLES.INVITATION), 'username', 'email', 'value')
    .table<CustomClaim>(TABLES.CUSTOM_CLAIM)
    .innerJoin<InvitationCustomClaim>(TABLES.INVITATION_CUSTOM_CLAIM, `${TABLES.CUSTOM_CLAIM}.id`, `${TABLES.INVITATION_CUSTOM_CLAIM}.claimId`)
    .innerJoin<Invitation>(TABLES.INVITATION, `${TABLES.INVITATION_CUSTOM_CLAIM}.invitationId`, `${TABLES.INVITATION}.id`)
    .where({ claimId }).orderBy(db().ref('username').withSchema(TABLES.INVITATION), 'asc')

  return { ...claim, users, groups, invitations }
}
