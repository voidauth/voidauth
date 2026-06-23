import { TABLES } from '@shared/db'
import { db } from './db'
import type { CustomClaim, InvitationCustomClaim, UserCustomClaim } from '@shared/db/CustomClaim'

const protectedScopes = [
  'openid',
  'address',
  'email',
  'phone',
  'profile',
  'groups',
] as const

const protectedClaims = [
  'address',
  'email',
  'email_verified',
  'phone_number',
  'phone_number_verified',
  'birthdate',
  'family_name',
  'gender',
  'given_name',
  'locale',
  'middle_name',
  'name',
  'nickname',
  'picture',
  'preferred_username',
  'profile',
  'updated_at',
  'website',
  'zoneinfo',
  'groups',
  'roles',
] as const

const defaultScopeClaims = {
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
} as const satisfies Partial<Record<typeof protectedScopes[number], (typeof protectedClaims[number])[]>>

export async function getCustomClaims(): Promise<{
  [key: string]: string[]
}> {
  const claims = (await db()
    .select('scope', 'claim')
    .table<CustomClaim>(TABLES.CUSTOM_CLAIM))
    .reduce<{ [key: string]: string[] }>((acc, c) => {
      if ((protectedScopes as ReadonlyArray<string>).includes(c.scope) || (protectedClaims as ReadonlyArray<string>).includes(c.claim)) {
        return acc
      }

      if (!acc[c.scope]) {
        acc[c.scope] = []
      }
      acc[c.scope]?.push(c.claim)
      return acc
    }, {})
  return {
    ...claims,
  }
}

export async function getAllClaims(): Promise<typeof defaultScopeClaims & Awaited<ReturnType<typeof getCustomClaims>>> {
  return {
    ...(await getCustomClaims()),
    ...defaultScopeClaims,
  }
}

export async function getUserCustomClaims(userId: string) {
  const claims = (await db()
    .select('scope', 'claim', 'value')
    .table<CustomClaim>(TABLES.CUSTOM_CLAIM)
    .innerJoin<UserCustomClaim>(TABLES.USER_CUSTOM_CLAIM, `${TABLES.CUSTOM_CLAIM}.id`, `${TABLES.USER_CUSTOM_CLAIM}.claimId`)
    .where({ userId }))
  return claims
}

export async function cleanUnreferencedCustomClaims() {
  const referencedClaimIds = Array.from(new Set([
    ...(await db().distinct('claimId').table<UserCustomClaim>(TABLES.USER_CUSTOM_CLAIM)).map(r => r.claimId),
    ...(await db().distinct('claimId').table<InvitationCustomClaim>(TABLES.INVITATION_CUSTOM_CLAIM)).map(r => r.claimId),
  ]))
  await db().table<CustomClaim>(TABLES.CUSTOM_CLAIM).delete()
    .where((w) => {
      if (referencedClaimIds.length) {
        w.whereNotIn('id', referencedClaimIds)
      }
    })
}
