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

export type PayloadType = 'Session'
  | 'AccessToken'
  | 'AuthorizationCode'
  | 'RefreshToken'
  | 'DeviceCode'
  | 'ClientCredentials'
  | 'Client'
  | 'InitialAccessToken'
  | 'RegistrationAccessToken'
  | 'Interaction'
  | 'ReplayDetection'
  | 'PushedAuthorizationRequest'
  | 'Grant'
  | 'BackchannelAuthenticationRequest'
