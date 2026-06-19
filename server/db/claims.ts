import { TABLES } from '@shared/db'
import { db } from './db'
import type { UserCustomClaim } from '@shared/db/UserCustomClaims'

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
}

export async function getAllClaims(): Promise<{
  [key: string]: string[]
}> {
  const distinctClaims = await db()
    .select('claim')
    .distinct('claim')
    .table<UserCustomClaim>(TABLES.USER_CUSTOM_CLAIM)
  return {
    custom: distinctClaims.map(c => c.claim),
    ...defaultClaims,
  }
}

export async function getUserCustomClaims(userId: string) {
  const claims = await db()
    .select('claim', 'value')
    .table<UserCustomClaim>(TABLES.USER_CUSTOM_CLAIM)
    .where({ userId })
  return claims
}
