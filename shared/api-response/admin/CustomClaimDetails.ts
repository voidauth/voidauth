import type { CustomClaim } from '@shared/db/CustomClaim'

export type CustomClaimDetails = CustomClaim & {
  users: {
    id: string
    username: string
    value: string
  }[]
  groups: {
    id: string
    name: string
    value: string
  }[]
  invitations: {
    id: string
    username?: string | null
    email?: string | null
    value: string
  }[]
}
