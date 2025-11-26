export type OIDCExtraParams = {
  proxyauth_url?: string
}

export function oidcLoginPath(
  baseUrl: string,
  redirectUrl?: string | null,
  isProxyAuth: boolean = false) {
  const encodedRedirect = redirectUrl ? encodeURIComponent((new URL(redirectUrl)).href) : ''
  const redirectParam = `redirect_uri=${encodeURIComponent(baseUrl + `/api/cb${redirectUrl ? '?redir=' + encodedRedirect : ''}`)}`
  let queryParams = `client_id=auth_internal_client&response_type=none&scope=openid&${redirectParam}`
  queryParams += isProxyAuth ? `&proxyauth_url=${encodedRedirect}` : ''
  return `/oidc/auth?${queryParams}`
}
