export function oidcLoginPath(
  baseUrl: string,
  defaultRedir: boolean = false,
  prompt?: 'login' | 'consent',
) {
  const redirectParam = `redirect_uri=${encodeURIComponent(baseUrl + `/api/cb${defaultRedir ? '?defaultRedir=true' : ''}`)}`
  let queryParams = `client_id=auth_internal_client&response_type=none&scope=openid&${redirectParam}`
  queryParams += prompt ? `&prompt=${prompt}` : ''
  return `/oidc/auth?${queryParams}`
}

export function proxyAuthPath(
  baseUrl: string,
  redirectUrl: string,
  prompt?: 'login',
) {
  const encodedRedirectUrl = encodeURIComponent(redirectUrl)
  const redirectParam = `redirect_uri=${encodeURIComponent(baseUrl + `/api/proxyauth_cb?proxyauth_url=${encodedRedirectUrl}`)}`
  let queryParams = `client_id=proxyauth_internal_client&response_type=none&scope=openid&${redirectParam}`
  queryParams += prompt ? `&prompt=${prompt}` : ''
  return `/oidc/auth?${queryParams}`
}
