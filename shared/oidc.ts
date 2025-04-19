export type OIDCExtraParams = {
  login_type: 'login' | 'register' | 'verify_email'
  login_id: string
  login_challenge: string
}

export function oidcLoginPath(redirectHost: string, 
    type?: OIDCExtraParams['login_type'], 
    id?: OIDCExtraParams["login_id"] | null, 
    challenge?: OIDCExtraParams["login_challenge"] | null) {
  const redirectParam = `redirect_uri=${redirectHost}/api/status`
  let queryParams = `client_id=auth_internal_client&response_type=none&scope=openid&${redirectParam}`
  queryParams += type ? `&login_type=${type}` : ''
  queryParams += id ? `&login_id=${id}` : ''
  queryParams += challenge ? `&login_challenge=${challenge}` : ''
  return `/oidc/auth?${queryParams}`
}