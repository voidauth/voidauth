import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private http = inject(HttpClient)

  private config?: Promise<ConfigResponse>

  async getConfig() {
    if (!this.config) {
      this.config = firstValueFrom(this.http.get<ConfigResponse>('/api/public/config'))
    }
    return this.config
  }

  async getOIDCWellknown() {
    return firstValueFrom(this.http.get<WellknownConfig>('/oidc/.well-known/openid-configuration'))
  }
}

export function getBaseHrefPath(): string {
  const baseHref = document.querySelector('base')?.getAttribute('href') || '/'
  return baseHref.replace(/\/$/, '')
}

export function getCurrentHost() {
  const currentUri = new URL(window.location.href)
  let currentHost = currentUri.hostname
  if (currentUri.protocol) {
    currentHost = `${currentUri.protocol}//${currentHost}`
  }
  if (currentUri.port) {
    currentHost = `${currentHost}:${currentUri.port}`
  }

  return currentHost + getBaseHrefPath()
}

export type WellknownConfig = {
  authorization_endpoint: string
  claims_parameter_supported: boolean
  claims_supported: string[]
  code_challenge_methods_supported: string[]
  end_session_endpoint: string
  grant_types_supported: string[]
  issuer: string
  jwks_uri: string
  authorization_response_iss_parameter_supported: boolean
  response_modes_supported: string[]
  response_types_supported: string[]
  scopes_supported: string[]
  subject_types_supported: string[]
  token_endpoint_auth_methods_supported: string[]
  token_endpoint_auth_signing_alg_values_supported: string[]
  token_endpoint: string
  id_token_signing_alg_values_supported: string[]
  pushed_authorization_request_endpoint: string
  request_uri_parameter_supported: boolean
  userinfo_endpoint: string
  dpop_signing_alg_values_supported: string[]
  revocation_endpoint: string
  backchannel_logout_supported: boolean
  backchannel_logout_session_supported: boolean
  claim_types_supported: string[]
}
