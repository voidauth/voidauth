import Provider, { type Configuration } from 'oidc-provider'
import { findAccount } from '../db/user'
import appConfig from '../util/config'
import { KnexAdapter } from './adapter'
import type { OIDCExtraParams } from '@shared/oidc'
import { generate } from 'generate-password'
import { REDIRECT_PATHS } from '@shared/constants'
import { errors } from 'oidc-provider'
import { getCookieKeys, getJWKs } from '../db/key'

// Do not allow any oidc-provider errors to redirect back to redirect_uri of client
let e: keyof typeof errors
for (e in errors) {
  Object.defineProperty(errors[e].prototype, 'allow_redirect', { value: false })
}

const extraParams: (keyof OIDCExtraParams)[] = ['login_type', 'login_id', 'login_challenge']
const jwks = { keys: (await getJWKs()).map(k => k.jwk) }
const cookieKeys = (await getCookieKeys()).map(k => k.value)

if (!jwks.keys.length) {
  throw new Error('No OIDC JWKs found, this error should not occur.')
}

if (!cookieKeys.length) {
  throw new Error('No Cookie Signing Keys found, this error should not occur.')
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
  cookies: {
    // get cookie signing keys from the DB
    keys: cookieKeys,
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
  jwks,
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
  pkce: {
    methods: ['S256'],
    required: () => false,
  },
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

// If session cookie assigned, assign a session-id cookie as well with samesite=none
// Used for ForwardAuth/AuthRequest proxy auth
provider.on('interaction.ended', (ctx) => {
  const sessionCookie = ctx.cookies.get('x-void-auth-session')
  if (sessionCookie) {
    ctx.cookies.set('x-void-auth-session-id', sessionCookie, {
      httpOnly: true,
      sameSite: 'none',
      secure: process.env.NODE_ENV === 'production',
    })
  }
})
