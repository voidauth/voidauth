import Provider, { type Configuration } from 'oidc-provider'
import { findAccount, getUserById, userRequiresMfa } from '../db/user'
import appConfig, { appUrl, basePath } from '../util/config'
import { KnexAdapter } from './adapter'
import { type OIDCExtraParams } from '@shared/oidc'
import { generate } from 'generate-password'
import { ADMIN_GROUP, REDIRECT_PATHS, TABLES, TTLs } from '@shared/constants'
import { errors } from 'oidc-provider'
import { getCookieKeys, getJWKs, makeKeysValid } from '../db/key'
import Keygrip from 'keygrip'
import * as psl from 'psl'
import { interactionPolicy } from 'oidc-provider'
import { isUnapproved, isUnverified, loginFactors } from '@shared/user'
import { getProxyAuthWithCache } from '../util/proxyAuth'
import { db } from '../db/db'
import type { OIDCGroup, Group } from '@shared/db/Group'
import { isMatch } from 'matcher'
import assert from 'assert'

// Extend 'oidc-provider' where needed
declare module 'oidc-provider' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Client {
    interface Schema {
      invalidate(message: string, code?: unknown): void
    }
  }

  // static-side augmentation: tell TS that Client has a nested Schema constructor
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace Client {
    const Schema: {
      prototype: Client.Schema
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new (...args: any[]): Client.Schema
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [k: string]: any
    }
  }
}

// Modify consent interaction policy to check for user and client groups
const { Check, base } = interactionPolicy
const modifiedInteractionPolicy = base()
const loginPromptPolicy = modifiedInteractionPolicy.get('login') as interactionPolicy.Prompt
loginPromptPolicy.checks.add(new Check('user_not_approved',
  'user has not been approved to login',
  'user_not_approved', async (ctx) => {
    const { oidc } = ctx
    if (oidc.account?.accountId) {
      // using a short cache
      const user = await getUserById(oidc.account.accountId)
      if (user && isUnapproved(user, appConfig.SIGNUP_REQUIRES_APPROVAL)) {
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
      const user = await getUserById(oidc.account.accountId)
      if (user && isUnverified(user, appConfig.EMAIL_VERIFICATION)) {
        return Check.REQUEST_PROMPT
      }
    }

    return Check.NO_NEED_TO_PROMPT
  },
))
loginPromptPolicy.checks.add(new Check('user_login_required',
  'user requires login',
  'user_login_required', async (ctx) => {
    const { oidc } = ctx
    if (oidc.account?.accountId) {
      const user = await getUserById(oidc.account.accountId)
      const amr = oidc.session?.amr ?? []
      if (user && loginFactors(amr) === 0) {
        return Check.REQUEST_PROMPT
      }
    }

    return Check.NO_NEED_TO_PROMPT
  },
))
loginPromptPolicy.checks.add(new Check('user_mfa_required',
  'user login requires mfa',
  'user_mfa_required', async (ctx) => {
    const { oidc } = ctx
    if (oidc.account?.accountId) {
      const user = await getUserById(oidc.account.accountId)
      const amr = oidc.session?.amr ?? []
      if (user && userRequiresMfa(user) && loginFactors(amr) < 2) {
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
      const client = await getProviderClient(oidc.client.clientId)
      if (client?.groups.length) {
        const user = await getUserById(oidc.account.accountId)
        if (user && !user.groups.some(g => g.name === ADMIN_GROUP) && !user.groups.some(g => client.groups.includes(g.name))) {
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
consentPromptPolicy.checks.add(new Check('client_mfa_required',
  'client requires mfa',
  'client_mfa_required', async (ctx) => {
    const { oidc } = ctx
    const amr = oidc.session?.amr ?? []
    if (oidc.client && !!oidc.client.require_mfa && loginFactors(amr) < 2) {
      return Check.REQUEST_PROMPT
    }

    if (oidc.client?.clientId === 'auth_internal_client') {
      if (typeof oidc.params?.proxyauth_url === 'string') {
        const proxyAuthURL = URL.parse(oidc.params.proxyauth_url)
        const domain = proxyAuthURL && await getProxyAuthWithCache(proxyAuthURL)
        if ((domain || undefined)?.mfaRequired && loginFactors(amr) < 2) {
          return Check.REQUEST_PROMPT
        }
      } else {
        const user = oidc.account?.accountId ? await getUserById(oidc.account.accountId) : null
        if (user?.hasTotp && loginFactors(amr) < 2) {
          return Check.REQUEST_PROMPT
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

const extraParams: (keyof OIDCExtraParams)[] = ['proxyauth_url']
await makeKeysValid()
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
      domain: psl.get(appUrl().hostname) ?? undefined,
    },
    short: {
      httpOnly: true,
      sameSite: 'lax',
      domain: psl.get(appUrl().hostname) ?? undefined,
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
  extraClientMetadata: { properties: ['skip_consent', 'require_mfa'] },
  renderError: (ctx, out, _error) => {
    ctx.body = {
      error: out,
    }
  },
  extraParams: extraParams,
  clientBasedCORS: (_ctx, origin, client) => {
    const originUrl = URL.parse(origin)
    if (originUrl?.protocol === 'https:') {
      return true
    }

    if (client.redirectUris?.some(uri => URL.parse(uri)?.origin === origin)) {
      return true
    }

    return false
  },
  findAccount: findAccount,
  adapter: KnexAdapter,
}

export const provider = new Provider(`${appConfig.APP_URL}/oidc`, configuration)

// Intercept Client Schema errors and prevent some that we want to ignore
// eslint-disable-next-line @typescript-eslint/unbound-method
const clientSchemaInvalidate = provider.Client.Schema.prototype.invalidate
// Make sure this exists and library did not change
assert.ok(clientSchemaInvalidate, 'oidc-provider provider.Client.Schema.prototype.invalidate does not exist.')
provider.Client.Schema.prototype.invalidate = function newInvalidate(message, code) {
  if (typeof message === 'string'
    && message === 'redirect_uris for native clients using Custom URI scheme should use reverse domain name based scheme') {
    return
  }

  clientSchemaInvalidate.call(this, message, code)
}

// allow any redirect_uri when using client auth_internal_client
// this client is not used for actual oidc, only profile or admin management, or proxy auth
// redirectUriAllowed on a client prototype checks whether a redirect_uri is allowed or not
// allow for wildcard matches as well
// eslint-disable-next-line @typescript-eslint/unbound-method
const { redirectUriAllowed, postLogoutRedirectUriAllowed } = provider.Client.prototype
provider.Client.prototype.redirectUriAllowed = function newRedirectUriAllowed(redirectUri) {
  if (Provider.ctx?.oidc.params?.client_id === 'auth_internal_client') {
    // auth_internal_client redirect_uri is allowed if hostname matches APP_URL
    return psl.get(URL.parse(redirectUri)?.hostname ?? '') === psl.get(appUrl().hostname)
  }

  // Check if any client redirectUris are a wildcard match
  if (this.redirectUris?.some((r: string) => {
    return r.includes('*') && isMatch(redirectUri, r)
  })) {
    return true
  }

  // Call the default redirectUriAllowed function
  return redirectUriAllowed.call(this, redirectUri)
}
provider.Client.prototype.postLogoutRedirectUriAllowed = function newPostLogoutRedirectUriAllowed(postLogoutRedirectUri: string) {
  // Check if any client postLogoutRedirectUris are a wildcard match
  if (this.postLogoutRedirectUris?.some((r: string) => {
    return r.includes('*') && isMatch(postLogoutRedirectUri, r)
  })) {
    return true
  }

  // Call the default postLogoutRedirectUriAllowed function
  return postLogoutRedirectUriAllowed.call(this, postLogoutRedirectUri)
}

export async function getProviderClient(client_id: string) {
  const client = (await provider.Client.find(client_id))?.metadata()
  if (!client) {
    return
  }
  const groups = (await db().select('name').table<OIDCGroup>(TABLES.OIDC_GROUP)
    .leftOuterJoin<Group>(TABLES.GROUP, 'oidc_group.groupId', 'group.id')
    .where({ oidcId: client_id }))
    .map(g => g.name)
  return { ...client, groups }
}
