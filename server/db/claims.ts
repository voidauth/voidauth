import { TABLES } from '@shared/db'
import { db } from './db'
import type { CustomClaim, UserCustomClaim } from '@shared/db/CustomClaim'
import { PROTECTED_CLAIMS, PROTECTED_CLAIMS_SET, PROTECTED_SCOPES } from '@shared/constants'

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
    .where({ userId }))
  return claims
}
