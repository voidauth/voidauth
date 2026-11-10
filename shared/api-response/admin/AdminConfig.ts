export type AdminConfig = {
  defaultUserExpireDuration?: number
  defaultGroups: {
    id: string
    name: string
    mfaRequired: boolean
    customClaims: {
      claim: string
      value: string
    }[]
  }[]
}
