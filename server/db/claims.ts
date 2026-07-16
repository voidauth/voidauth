import { TABLES } from '@shared/db'
import { db } from './db'
import type { CustomScope, CustomClaim, UserCustomClaim } from '@shared/db/CustomClaim'
import { PROTECTED_CLAIMS, PROTECTED_CLAIMS_SET, PROTECTED_SCOPES_SET, PROTECTED_SCOPES } from '@shared/constants'
import type { CustomClaimsResponse } from '@shared/api-response/admin/CustomClaimResponse'
import { PayloadTypes, type OIDCPayload } from '@shared/db/OIDCPayload'
import type { ClientMetadata } from 'oidc-provider'

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

// Set up remote cache of current provider scopes and claims
type ProviderScopeClaimCache = {
  scopes: Set<string>
  claims: Record<string, string[]>
}
const providerScopeClaimCache: ProviderScopeClaimCache = {
  scopes: new Set(),
  claims: {},
}
export function updateProviderScopeClaimCache(scopeClaims: ProviderScopeClaimCache) {
  providerScopeClaimCache.scopes.clear()
  scopeClaims.scopes.forEach(s => providerScopeClaimCache.scopes.add(s))
  providerScopeClaimCache.claims = JSON.parse(JSON.stringify(scopeClaims.claims)) as Record<string, string[]>
}
export function getProviderScopeClaimCache(): ProviderScopeClaimCache {
  return {
    scopes: new Set(providerScopeClaimCache.scopes),
    claims: JSON.parse(JSON.stringify(providerScopeClaimCache.claims)) as Record<string, string[]>,
  }
}

export async function getCustomClaimsRecords(): Promise<CustomClaimsResponse[]> {
  const scopesClaims = (await db()
    .select(
      db().ref('id').withSchema(TABLES.CUSTOM_SCOPE).as('scopeId'),
      db().ref('id').withSchema(TABLES.CUSTOM_CLAIM).as('claimId'),
      db().ref('scope').withSchema(TABLES.CUSTOM_SCOPE),
      db().ref('claim').withSchema(TABLES.CUSTOM_CLAIM),
      db().ref('includedInLdap').withSchema(TABLES.CUSTOM_CLAIM))
    .table<CustomScope>(TABLES.CUSTOM_SCOPE)
    .leftOuterJoin<CustomClaim | Record<string, null>>(TABLES.CUSTOM_CLAIM, `${TABLES.CUSTOM_SCOPE}.id`, `${TABLES.CUSTOM_CLAIM}.scopeId`))
    .filter(c => !PROTECTED_SCOPES_SET.has(c.scope) && (!c.claim || !PROTECTED_CLAIMS_SET.has(c.claim)))

  return scopesClaims
}

export async function getCustomClaims(): Promise<Record<string, string[]>> {
  const claims = (await getCustomClaimsRecords())
    .reduce<{ [key: string]: string[] }>((acc, c) => {
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
  return (await db().select().table<CustomScope>(TABLES.CUSTOM_SCOPE)).filter(s => !PROTECTED_SCOPES_SET.has(s.scope))
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
    .select('scope', 'claim', 'value', 'includedInLdap')
    .table<CustomScope>(TABLES.CUSTOM_SCOPE)
    .innerJoin<CustomClaim>(TABLES.CUSTOM_CLAIM, `${TABLES.CUSTOM_SCOPE}.id`, `${TABLES.CUSTOM_CLAIM}.scopeId`)
    .innerJoin<UserCustomClaim>(TABLES.USER_CUSTOM_CLAIM, `${TABLES.CUSTOM_CLAIM}.id`, `${TABLES.USER_CUSTOM_CLAIM}.claimId`)
    .where({ userId }))
  return claims
}

/**
 * Because client scopes are stored raw as a string, make sure they are valid
 */
export async function cleanMissingClientScopes() {
  // get all scopes
  const allScopes = await getAllScopes()
  // Ensure clients only have scopes in list
  const clients = (await db().select('id', 'payload').table<OIDCPayload>(TABLES.OIDC_PAYLOADS).where({ type: PayloadTypes.Client }))
    .map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const c: ClientMetadata = JSON.parse(r.payload)
      return { id: r.id, metadata: c }
    })
  for (const client of clients) {
    const clientScopes = client.metadata.scope?.split(/\s+/).filter(Boolean) ?? []
    const validScopes = clientScopes.filter(s => allScopes.includes(s))
    if (validScopes.length !== clientScopes.length) {
      client.metadata.scope = validScopes.join(' ')
      await db().table<OIDCPayload>(TABLES.OIDC_PAYLOADS).update({ payload: JSON.stringify(client.metadata) }).where({ id: client.id })
    }
  }
}
