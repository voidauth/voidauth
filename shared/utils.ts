export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type RemoveKeys<T, K extends keyof T> = Omit<T, K> & {[k in K]?: undefined};

export type Nullable<T> = { [K in keyof T]: T[K] | null }

export function oidcLoginPath(redirectHost: string, 
    type?: 'login' | 'register' | 'verify_email', 
    id?: string | null, 
    challenge?: string | null) {
  const redirectParam = `redirect_uri=${redirectHost}/api/status`
  let queryParams = `client_id=unknown_auth_internal_client&response_type=none&scope=openid&${redirectParam}`
  queryParams += type ? `&login_type=${type}` : ''
  queryParams += id ? `&login_id=${id}` : ''
  queryParams += challenge ? `&login_challenge=${challenge}` : ''
  return `/oidc/auth?${queryParams}`
}
