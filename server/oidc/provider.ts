import Provider, { type Configuration, type KoaContextWithOIDC } from 'oidc-provider'
import { findAccount } from '../db/user'
import appConfig from '../util/config'
import { KnexAdapter } from './adapter'
import type { OIDCExtraParams } from '@shared/oidc'
import { generate } from 'generate-password'
import { REDIRECT_PATHS, TTLs } from '@shared/constants'
import { errors } from 'oidc-provider'
import { getCookieKeys, getJWKs } from '../db/key'
import Keygrip from 'keygrip'
import * as psl from 'psl'
import { createExpiration } from '../db/util'

// Do not allow any oidc-provider errors to redirect back to redirect_uri of client
let e: keyof typeof errors
for (e in errors) {
  Object.defineProperty(errors[e].prototype, 'allow_redirect', { value: false })
}

const extraParams: (keyof OIDCExtraParams)[] = ['login_type', 'login_id', 'login_challenge']
export const initialJwks = { keys: (await getJWKs()).map(k => k.jwk) }
export const providerCookieKeys = (await getCookieKeys()).map(k => k.value)

if (!initialJwks.keys.length) {
  throw new Error('No OIDC JWKs found.')
}

if (!providerCookieKeys.length) {
  throw new Error('No Cookie Signing Keys found.')
}

const configuration: Configuration = {
  features: {
    devInteractions: {
      enabled: false,
    },
    backchannelLogout: {
      enabled: true,
    },
    revocation: {
      enabled: true,
    },
    rpInitiatedLogout: {
      // custom logout question page
      logoutSource: (ctx, form) => {
        // parse out secret value so static frontend can use
        const secret = /value="(\w*)"/.exec(form)
        ctx.redirect(`/${REDIRECT_PATHS.LOGOUT}${secret?.[1] ? `/${secret[1]}` : ''}`)
      },
      postLogoutSuccessSource: (ctx) => {
        // TODO: custom logout success page?
        ctx.redirect('/')
      },
    },
  },
  interactions: {
    url: (_ctx, _interaction) => {
      return `/api/interaction`
    },
  },
  ttl: {
    Session: TTLs.SESSION,
    Grant: TTLs.GRANT,
    Interaction: TTLs.SESSION,
  },
  cookies: {
    // keygrip for rotating cookie signing keys
    keys: Keygrip(providerCookieKeys),
    names: {
      interaction: 'x-void-auth-interaction',
      resume: 'x-void-auth-resume',
      session: 'x-void-auth-session',
    },
    long: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
    short: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  },
  jwks: initialJwks,
  clients: [
    {
      client_id: 'auth_internal_client',
      client_secret: generate({
        length: 32,
        numbers: true,
      }), // unique every time, never used
      redirect_uris: [`${appConfig.APP_DOMAIN}/api/status`],
      response_types: ['none'],
      scope: 'openid',
    },
  ],
  clientDefaults: {
    scope: 'openid offline_access profile email groups',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: [
      'code',
      'none',
    ],
  },
  claims: {
    // OIDC 1.0 Standard
    // address: ['address'],
    email: ['email', 'email_verified'],
    // phone: ['phone_number', 'phone_number_verified'],
    profile: [
      // 'birthdate',
      // 'family_name',
      // 'gender',
      // 'given_name',
      // 'locale',
      // 'middle_name',
      'name',
      // 'nickname',
      // 'picture',
      'preferred_username',
      // 'profile',
      // 'updated_at',
      // 'website',
      // 'zoneinfo'
    ],

    // Additional
    groups: ['groups'],
  },
  extraClientMetadata: { properties: ['skip_consent'] },
  renderError: (ctx, out, error) => {
    console.error(error)
    ctx.status = 500
    ctx.body = {
      error: out,
    }
  },
  extraParams: extraParams,
  clientBasedCORS: () => true,
  findAccount: findAccount,
  adapter: KnexAdapter,
}

export const provider = new Provider(`${appConfig.APP_DOMAIN}/oidc`, configuration)

// If session cookie assigned, assign a session-id cookie as well with samesite=none on base domain
// Used for ForwardAuth/AuthRequest proxy auth
provider.on('session.saved', (session) => {
  const sessionCookie = session.uid
  // @ts-expect-error ctx actually is a static getter on Provider
  const ctx = Provider.ctx as KoaContextWithOIDC | undefined
  if (!ctx || !sessionCookie) {
    return
  }
  // domain should be sld
  const domain = psl.get(ctx.request.hostname)
  const expires = new Date((ctx.oidc.session?.exp ?? 0) * 1000 || createExpiration(TTLs.SESSION))
  ctx.cookies.set('x-void-auth-session-uid', sessionCookie, {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires,
    domain: domain ?? undefined,
  })
})

provider.on('session.destroyed', (_session) => {
  // @ts-expect-error ctx actually is a static getter on Provider
  const ctx = Provider.ctx as KoaContextWithOIDC | undefined
  if (!ctx) {
    return
  }
  // domain should be sld
  const domain = psl.get(ctx.request.hostname)
  ctx.cookies.set('x-void-auth-session-uid', '', {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    domain: domain ?? undefined,
  })
})
