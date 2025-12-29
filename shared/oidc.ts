export type OIDCExtraParams = {
  proxyauth_url?: string
}

export function oidcLoginPath(
  baseUrl: string,
  options?: {
    redirectUrl?: string | null
    isProxyAuth?: boolean
    prompt?: 'login' | 'consent'
  }) {
  const encodedRedirect = options?.redirectUrl ? encodeURIComponent((new URL(options.redirectUrl)).href) : ''
  const redirectParam = `redirect_uri=${encodeURIComponent(baseUrl + `/api/cb${options?.redirectUrl ? '?redir=' + encodedRedirect : ''}`)}`
  let queryParams = `client_id=auth_internal_client&response_type=none&scope=openid&${redirectParam}`
  queryParams += options?.prompt ? `&prompt=${options.prompt}` : ''
  queryParams += options?.isProxyAuth ? `&proxyauth_url=${encodedRedirect}` : ''
  return `/oidc/auth?${queryParams}`
}
