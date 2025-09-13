import Provider, { type Configuration } from 'oidc-provider'
import { findAccount, getUserById, isUnapproved, isUnverified } from '../db/user'
import appConfig, { appUrl, basePath } from '../util/config'
import { KnexAdapter } from './adapter'
import type { OIDCExtraParams } from '@shared/oidc'
import { generate } from 'generate-password'
import { ADMIN_GROUP, REDIRECT_PATHS, TTLs } from '@shared/constants'
import { errors } from 'oidc-provider'
import { getCookieKeys, getJWKs } from '../db/key'
import Keygrip from 'keygrip'
import * as psl from 'psl'
import { createExpiration } from '../db/util'
import { interactionPolicy } from 'oidc-provider'
import { getClient } from '../db/client'
import type { UserDetails } from '@shared/api-response/UserDetails'

// Modify consent interaction policy to check for user and client groups
let userCheckCache: Record<string, Promise<UserDetails | undefined>> = {}
let userCheckCacheExpires: number = 0
const getUserWithCache = async (accountId: string) => {
  if (userCheckCacheExpires < new Date().getTime()) {
    userCheckCache = {}
    userCheckCacheExpires = new Date().getTime() + 30000 // 30 seconds
  }
  if (!userCheckCache[accountId]) {
    userCheckCache[accountId] = getUserById(accountId)
  }
  return userCheckCache[accountId]
}
const { Check, base } = interactionPolicy
const modifiedInteractionPolicy = base()
const loginPromptPolicy = modifiedInteractionPolicy.get('login') as interactionPolicy.Prompt
loginPromptPolicy.checks.add(new Check('user_not_approved',
  'user has not been approved to login',
  'user_not_approved', async (ctx) => {
    const { oidc } = ctx
    if (oidc.account?.accountId) {
      // using a short cache
      const user = await getUserWithCache(oidc.account.accountId)
      if (user && isUnapproved(user)) {
        return Check.REQUEST_PROMPT
      }
    }

    return Check.NO_NEED_TO_PROMPT
  },
))
loginPromptPolicy.checks.add(new Check('user_email_not_validated',
  'user email address does not exist or is not validated',
  'user_email_not_validated', async (ctx) => {
    const { oidc } = ctx
    if (oidc.account?.accountId && appConfig.EMAIL_VERIFICATION) {
      const user = await getUserWithCache(oidc.account.accountId)
      if (user && isUnverified(user)) {
        return Check.REQUEST_PROMPT
      }
    }

    return Check.NO_NEED_TO_PROMPT
  },
))
const consentPromptPolicy = modifiedInteractionPolicy.get('consent') as interactionPolicy.Prompt
consentPromptPolicy.checks.add(new Check('user_group_missing',
  'missing any security group that would give access to the resource',
  'user_group_missing', async (ctx) => {
    const { oidc } = ctx
    if (oidc.client?.clientId && oidc.account?.accountId) {
      const client = await getClient(oidc.client.clientId)
      if (client?.groups.length) {
        const user = await getUserById(oidc.account.accountId)
        if (user && !user.groups.includes(ADMIN_GROUP) && !user.groups.some(g => client.groups.includes(g))) {
          // Throw oidc error
          const error: errors.OIDCProviderError = {
            statusCode: 403,
            error: 'user_group_missing',
            error_description: 'missing any security group that would give access to the resource',
            allow_redirect: false,
            status: 403,
            expose: true,
            name: 'user_group_missing',
            message: 'user_group_missing',
          }
          throw error
        }
      }
    }

    return Check.NO_NEED_TO_PROMPT
  },
))

// Do not allow any oidc-provider errors to redirect back to redirect_uri of client
let e: keyof typeof errors
for (e in errors) {
  Object.defineProperty(errors[e].prototype, 'allow_redirect', { value: false })
}

export function isOIDCProviderError(e: unknown): e is errors.OIDCProviderError {
  return typeof e === 'object'
    && e !== null
    && 'error_description' in e
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
      logoutSource: (ctx, _form) => {
        // parse out secret value so static frontend can use
        const secret = ctx.oidc.session?.state?.secret
        ctx.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.LOGOUT}${typeof secret === 'string' ? `/${secret}` : ''}`)
      },
      postLogoutSuccessSource: (ctx) => {
        // TODO: custom logout success page?
        ctx.redirect(appConfig.DEFAULT_REDIRECT || appConfig.APP_URL)
      },
    },
  },
  interactions: {
    url: (_ctx, _interaction) => {
      return `${basePath()}/api/interaction`
    },
    policy: modifiedInteractionPolicy,
  },
  ttl: {
    Session: TTLs.SESSION,
    Grant: TTLs.GRANT,
    Interaction: TTLs.INTERACTION,
    // Below copied from node-oidc-provider, if omitted it will complain
    // Even though these seem like sensible defaults
    AccessToken: function AccessTokenTTL(_ctx, token, _client) {
      return token.resourceServer?.accessTokenTTL || 60 * 60 // 1 hour in seconds
    },
    AuthorizationCode: 60 /* 1 minute in seconds */,
    BackchannelAuthenticationRequest: function BackchannelAuthenticationRequestTTL(ctx, _request, _client) {
      if (ctx.oidc.params?.requested_expiry) {
        // 10 minutes in seconds or requested_expiry, whichever is shorter
        return Math.min(10 * 60, +ctx.oidc.params.requested_expiry)
      }

      return 10 * 60 // 10 minutes in seconds
    },
    ClientCredentials: function ClientCredentialsTTL(_ctx, token, _client) {
      return token.resourceServer?.accessTokenTTL || 10 * 60 // 10 minutes in seconds
    },
    DeviceCode: 600 /* 10 minutes in seconds */,
    IdToken: 3600 /* 1 hour in seconds */,
    RefreshToken: function RefreshTokenTTL(ctx, token, client) {
      if (
        ctx.oidc.entities.RotatedRefreshToken
        && client.applicationType === 'web'
        && client.clientAuthMethod === 'none'
        && !token.isSenderConstrained()
      ) {
      // Non-Sender Constrained SPA RefreshTokens do not have infinite expiration through rotation
        return ctx.oidc.entities.RotatedRefreshToken.remainingTTL
      }

      return 14 * 24 * 60 * 60 // 14 days in seconds
    },
  },
  cookies: {
    // keygrip for rotating cookie signing keys
    keys: Keygrip(providerCookieKeys),
    names: {
      interaction: 'x-voidauth-interaction',
      resume: 'x-voidauth-resume',
      session: 'x-voidauth-session',
    },
    long: {
      httpOnly: true,
      sameSite: 'lax',
      secure: appUrl().protocol === 'https:',
    },
    short: {
      httpOnly: true,
      sameSite: 'lax',
      secure: appUrl().protocol === 'https:',
    },
  },
  jwks: initialJwks,
  clients: [
    {
      client_id: 'auth_internal_client',
      // unique every time, never used
      client_secret: generate({
        length: 32,
        numbers: true,
      }),
      // any redirect will work, injected custom redirect_uri validator below
      redirect_uris: [appConfig.APP_URL],
      response_modes: ['query'],
      // not actually used for oidc, just for logging in for
      // profile management and proxy auth
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
  responseTypes: [
    'code',
    'id_token', 'id_token token',
    'code id_token', 'code token', 'code id_token token',
    'none',
  ],
  conformIdTokenClaims: false,
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

export const provider = new Provider(`${appConfig.APP_URL}/oidc`, configuration)

// allow any redirect_uri when using client auth_internal_client
// this client is not used for actual oidc, only profile or admin management, or proxy auth
// redirectUriAllowed on a client prototype checks whether a redirect_uri is allowed or not
// eslint-disable-next-line @typescript-eslint/unbound-method
const { redirectUriAllowed } = provider.Client.prototype
provider.Client.prototype.redirectUriAllowed = function abc(redirectUri) {
  if (Provider.ctx?.oidc.params?.client_id === 'auth_internal_client') {
    return psl.get(URL.parse(redirectUri)?.hostname ?? '') === psl.get(appUrl().hostname)
  }
  return redirectUriAllowed.call(this, redirectUri)
}

// If session cookie assigned, assign a session-id cookie as well with samesite=none on base domain
// Used for proxy auth
provider.on('session.saved', (session) => {
  const sessionCookie = session.uid
  const ctx = Provider.ctx
  if (!ctx || !sessionCookie) {
    return
  }
  // domain should be sld
  const domain = psl.get(ctx.request.hostname)
  const expires = new Date((ctx.oidc.session?.exp ?? 0) * 1000 || createExpiration(TTLs.SESSION))
  ctx.cookies.set('x-voidauth-session-uid', sessionCookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.request.secure,
    expires,
    domain: domain ?? undefined,
  })
})

provider.on('session.destroyed', (_session) => {
  const ctx = Provider.ctx
  if (!ctx) {
    return
  }
  // domain should be sld
  const domain = psl.get(ctx.request.hostname)
  ctx.cookies.set('x-voidauth-session-uid', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.request.secure,
    maxAge: 0,
    domain: domain ?? undefined,
  })
})
