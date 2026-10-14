export type ConfigResponse = {
  domain: string
  appName: string
  zxcvbnMin: number
  emailActive: boolean
  emailVerification: boolean
  registration: boolean
  disableFileUploads: boolean
  disablePasskeyPrompt: boolean
  contactEmail?: string
  defaultRedirect?: string
}
