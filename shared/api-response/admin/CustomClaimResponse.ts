import type { FoundOrNull } from '@shared/db'

export type CustomClaimsResponse = {
  scopeId: string
  scope: string
} & FoundOrNull<{
  claimId: string
  claim: string
}>
