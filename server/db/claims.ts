import { TABLES } from '@shared/db'
import { db } from './db'
import type { CustomScope, CustomClaim, UserCustomClaim } from '@shared/db/CustomClaim'
import { PROTECTED_CLAIMS, PROTECTED_CLAIMS_SET, PROTECTED_SCOPES_SET, PROTECTED_SCOPES } from '@shared/constants'
import { PayloadTypes, type OIDCPayload } from '@shared/db/OIDCPayload'

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
} as const satisfies Partial<Record<typeof PROTECTED_SCOPES[number], (typeof PROTECTED_CLAIMS[number])[]>>

const providerScopeCache = new Set<string>()
export async function updateProviderScopeCache() {
  const scopes = await getAllScopes()
  providerScopeCache.clear()
  scopes.forEach(s => providerScopeCache.add(s))
}
export function getProviderScopeCache() {
  return new Set(providerScopeCache)
}

export async function getCustomClaims(): Promise<Record<string, string[]>> {
  const claims = (await db()
    .select('scope', 'claim')
    .table<CustomScope>(TABLES.CUSTOM_SCOPE)
    .innerJoin<CustomClaim>(TABLES.CUSTOM_CLAIM, `${TABLES.CUSTOM_SCOPE}.id`, `${TABLES.CUSTOM_CLAIM}.scopeId`))
    .reduce<{ [key: string]: string[] }>((acc, c) => {
      if (PROTECTED_SCOPES_SET.has(c.scope)
        || (c.claim && PROTECTED_CLAIMS_SET.has(c.claim))) {
        return acc
      }

      if (!acc[c.scope]) {
        acc[c.scope] = []
      }
      if (c.claim) {
        acc[c.scope]?.push(c.claim)
      }
      return acc
    }, {})
  return {
    ...claims,
  }
}

export async function getAllClaims(): Promise<Record<string, string[]>> {
  return {
    ...(await getCustomClaims()),
    ...defaultScopeClaims,
  }
}

export async function getCustomScopes() {
  return await db().select().table<CustomScope>(TABLES.CUSTOM_SCOPE)
}

export async function getAllScopes(): Promise<string[]> {
  return [
    ...(await getCustomScopes()).map(s => s.scope),
    ...Object.keys(defaultScopeClaims),
    'openid', 'offline_access',
  ]
}

export async function getUserCustomClaims(userId: string) {
  const claims = (await db()
    .select('scope', 'claim', 'value')
    .table<CustomScope>(TABLES.CUSTOM_SCOPE)
    .innerJoin<CustomClaim>(TABLES.CUSTOM_CLAIM, `${TABLES.CUSTOM_SCOPE}.id`, `${TABLES.CUSTOM_CLAIM}.scopeId`)
    .innerJoin<UserCustomClaim>(TABLES.USER_CUSTOM_CLAIM, `${TABLES.CUSTOM_CLAIM}.id`, `${TABLES.USER_CUSTOM_CLAIM}.claimId`)
    .where({ userId }))
  return claims
}

export async function cleanUnreferencedCustomClaims() {
  const referencedClaimIds = Array.from(new Set([
    ...(await db().distinct('claimId').table<UserCustomClaim>(TABLES.USER_CUSTOM_CLAIM)).map(r => r.claimId),
  ]))
  await db().table<CustomClaim>(TABLES.CUSTOM_CLAIM).delete()
    .where((w) => {
      if (referencedClaimIds.length) {
        w.whereNotIn('id', referencedClaimIds)
      }
    })

  const referencedScopeIds: string[] = Array.from(new Set([
    ...(await db().distinct('scopeId').table<CustomClaim>(TABLES.CUSTOM_CLAIM)).map(r => r.scopeId),
  ]))
  const referencedScopeNames: string[] = Array.from(new Set([
    ...(await db().select('id', 'payload').table<OIDCPayload>(TABLES.OIDC_PAYLOADS).where({ type: PayloadTypes.Client })).map((r) => {
      const c: unknown = JSON.parse(r.payload)
      return (c && typeof c === 'object' && 'scope' in c && typeof c.scope === 'string' && c.scope) ? c.scope : null
    }).filter(s => s != null),
  ]))
  await db().table<CustomScope>(TABLES.CUSTOM_SCOPE).delete()
    .where((w) => {
      let started = false
      if (referencedScopeIds.length) {
        w.whereNotIn('id', referencedScopeIds)
        started = true
      }
      if (referencedScopeNames.length) {
        if (started) {
          w.and.whereNotIn('scope', referencedScopeNames)
        } else {
          w.whereNotIn('scope', referencedScopeNames)
        }
      }
    })
}
