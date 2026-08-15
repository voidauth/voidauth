export type AdminConfig = {
  defaultUserExpireDuration?: number
  defaultGroups: {
    id: string
    name: string
    customClaims: {
      claim: string
      value: string
    }[]
  }[]
}
