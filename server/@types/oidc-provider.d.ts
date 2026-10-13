import 'oidc-provider'

declare module 'oidc-provider' {
  interface Client {
    backchannelLogout(sub: string, sid?: string): Promise<void>
  }
}
