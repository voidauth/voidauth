import type { ValueOf } from '@shared/utils'

export type OIDCPayload = {
  id: string
  type: PayloadType
  payload: string
  grantId?: string | null
  userCode?: string | null
  uid?: string | null
  expiresAt?: Date | number | null
  consumedAt?: Date | number | null
  accountId?: string | null
}

export const PayloadTypes = {
  Session: 'Session',
  AccessToken: 'AccessToken',
  AuthorizationCode: 'AuthorizationCode',
  RefreshToken: 'RefreshToken',
  DeviceCode: 'DeviceCode',
  ClientCredentials: 'ClientCredentials',
  Client: 'Client',
  InitialAccessToken: 'InitialAccessToken',
  RegistrationAccessToken: 'RegistrationAccessToken',
  Interaction: 'Interaction',
  ReplayDetection: 'ReplayDetection',
  PushedAuthorizationRequest: 'PushedAuthorizationRequest',
  Grant: 'Grant',
  BackchannelAuthenticationRequest: 'BackchannelAuthenticationRequest',
} as const

export type PayloadType = ValueOf<typeof PayloadTypes>
