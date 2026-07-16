export type CustomClaimsResponse = {
  scopeId: string
  scope: string
} & ({
  claimId: string | null
  claim: string | null
  includedInLdap: boolean | null
} | Record<string, null>)
