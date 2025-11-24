export type ConfigResponse = {
  domain: string
  appName: string
  zxcvbnMin: number
  emailActive: boolean
  emailVerification: boolean
  signupRequiresApproval: boolean
  registration: boolean
  contactEmail?: string
  defaultRedirect?: string
  mfaRequired: boolean
}
