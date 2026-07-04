import Provider, { type ClientMetadata, type Configuration } from 'oidc-provider'
import { findAccount, getUserById, userRequiresMfa } from '../db/user'
import appConfig, { basePath, getSessionDomain, sessionDomainReaches } from '../util/config'
import { KnexAdapter } from './adapter'
import { ADMIN_GROUP, CLIENT_DEFAULTS, PROTECTED_SCOPES_SET, REDIRECT_PATHS, TTLs } from '@shared/constants'
import { errors } from 'oidc-provider'
import { getCookieKeys, getJWKs, makeKeysValid } from '../db/key'
import { interactionPolicy } from 'oidc-provider'
import { isExpired, isUnapproved, isUnverifiedEmail, loginFactors } from '@shared/user'
import { isMatch } from 'matcher'
import assert from 'assert'
import { wildcardRedirect } from '@shared/url'
import type { IncomingMessage, ServerResponse } from 'http'
import { getProxyAuthWithCache } from '../db/proxyAuth'
import { RESPONSE_TYPES } from '@shared/api-request/admin/ClientUpsert'
import { randomBytes, randomUUID } from 'crypto'
import { logger } from '../util/logger'
import { getClient } from '../db/client'
import type { OIDCGroup, Group } from '@shared/db/Group'
import add from 'oidc-provider/lib/helpers/add_client.js'
import { db } from '../db/db'
import { mergeKeys } from '../db/util'
import type { User } from '@shared/db/User'
import { PayloadTypes } from '@shared/db/OIDCPayload'
import { TABLES } from '@shared/db'
import { cleanUnreferencedCustomClaims, getAllClaims, getAllScopes, updateProviderScopeClaimCache } from '../db/claims'
import type { CustomScope } from '@shared/db/CustomClaim'

// Extend 'oidc-provider' where needed
declare module 'oidc-provider' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Client {
    interface Schema {
      redirect_uris: string[]
      invalidate(message: string, code?: unknown): void
      redirectUris(uris: string[], label?: string): void
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

/**
 * Provider Configuration
 */

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
loginPromptPolicy.checks.add(new Check('user_expired',
  'user account access has expired',
  'user_expired', async (ctx) => {
    const { oidc } = ctx
    if (oidc.account?.accountId) {
      // using a short cache
      const user = await getUserById(oidc.account.accountId)
      if (user && isExpired(user)) {
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
      if (user && isUnverifiedEmail(user, appConfig.EMAIL_VERIFICATION)) {
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
      const client = await getClient(oidc.client.clientId)
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

    // If client requires mfa, check for it
    if (oidc.client && !!oidc.client.require_mfa && loginFactors(amr) < 2) {
      return Check.REQUEST_PROMPT
    }

    // auth internal client requires mfa if the user has it set up
    if (oidc.client?.clientId === 'auth_internal_client') {
      const user = oidc.account?.accountId ? await getUserById(oidc.account.accountId) : null
      if (user?.hasTotp && loginFactors(amr) < 2) {
        return Check.REQUEST_PROMPT
      }
    }

    // proxyauth internal client requires mfa if proxyauth_url is for a domain that requires mfa
    if (oidc.client?.clientId === 'proxyauth_internal_client') {
      const redirectURL = typeof oidc.params?.redirect_uri === 'string' ? URL.parse(oidc.params.redirect_uri) : null
      const proxyAuthURLParam = redirectURL?.searchParams.get('proxyauth_url')
      const proxyAuthURL = proxyAuthURLParam ? URL.parse(proxyAuthURLParam) : null
      const domain = proxyAuthURL && await getProxyAuthWithCache(proxyAuthURL)
      if (domain?.mfaRequired && loginFactors(amr) < 2) {
        return Check.REQUEST_PROMPT
      }
    }

    return Check.NO_NEED_TO_PROMPT
  },
))
consentPromptPolicy.checks.add(new Check('proxyauth_url_invalid',
  'proxyauth_url is invalid',
  'proxyauth_url_invalid', async (ctx) => {
    const { oidc } = ctx

    // if client is proxyauth internal client, check that proxyauth_url is valid and can be reached by session domain
    if (oidc.client?.clientId === 'proxyauth_internal_client') {
      const redirectURL = typeof oidc.params?.redirect_uri === 'string' ? URL.parse(oidc.params.redirect_uri) : null
      const proxyAuthURLParam = redirectURL?.searchParams.get('proxyauth_url')
      const proxyAuthURL = proxyAuthURLParam ? URL.parse(proxyAuthURLParam) : null
      let errorName = 'proxyauth_url_invalid'
      let errorMessage = ''
      let status = 400
      if (!proxyAuthURL) {
        errorMessage = 'No redirect url provided'
      } else if (!sessionDomainReaches(proxyAuthURL.hostname)) {
        errorMessage = 'Session domain does not reach redirect url'
      } else if (!(await getProxyAuthWithCache(proxyAuthURL))) {
        errorName = 'proxyauth_domain_no_match'
        errorMessage = 'Forbidden: no ProxyAuth domain matches redirect url'
        status = 403
      }
      if (errorMessage) {
        logger({ level: 'debug', message: 'proxyauth_internal_client validation failed.', errors: [{
          name: 'ProxyAuthURLInvalid',
          message: errorMessage + `. redirect_url = ${String(oidc.params?.redirect_uri)}`,
        }] })
        // Throw oidc error
        const error: errors.OIDCProviderError = {
          statusCode: status,
          error: errorName,
          error_description: errorMessage,
          allow_redirect: false,
          status: status,
          expose: true,
          name: 'proxyauth_url_invalid',
          message: 'proxyauth_url_invalid',
        }
        throw error
      }
    }

    return Check.NO_NEED_TO_PROMPT
  },
))

// add policy for select_account
const selectAccountPromptPolicy = new interactionPolicy.Prompt({
  name: 'select_account',
  requestable: true,
}) // no checks, this is a dummy prompt that is not implemented but might be requested
modifiedInteractionPolicy.add(selectAccountPromptPolicy)

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

async function getNextConfig() {
  await makeKeysValid() // always do this, we must not use expired keys
  const jwks = { keys: (await getJWKs()).map(k => k.jwk) }
  const cookieKeys = (await getCookieKeys()).map(k => k.value)

  if (!jwks.keys.length) {
    throw new Error('No OIDC JWKs found.')
  }

  if (!cookieKeys.length) {
    throw new Error('No Cookie Signing Keys found.')
  }

  const configuration = {
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
      encryption: {
        enabled: true,
      },
      jwtResponseModes: {
        enabled: true,
      },
      introspection: {
        enabled: true,
      },
      jwtIntrospection: {
        enabled: true,
      },
      jwtUserinfo: {
        enabled: true,
      },
      claimsParameter: {
        enabled: false,
      },
      rpInitiatedLogout: {
      // custom logout question page
        logoutSource: (ctx, _form) => {
        // parse out secret value so static frontend can use
          const secret = ctx.oidc.session?.state?.secret
          ctx.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.LOGOUT}${typeof secret === 'string' ? `/${secret}` : ''}`)
        },
        postLogoutSuccessSource: (ctx) => {
        // TODO: custom logout success page
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
      keys: cookieKeys,
      names: {
        interaction: 'x-voidauth-interaction',
        resume: 'x-voidauth-resume',
        session: 'x-voidauth-session',
      },
      long: {
        httpOnly: true,
        sameSite: 'lax',
        domain: getSessionDomain(),
      },
      short: {
        httpOnly: true,
        sameSite: 'lax',
        domain: getSessionDomain(),
      },
    },
    jwks: jwks,
    clients: [
      {
        client_id: 'auth_internal_client',
        // unique every time, never used
        client_secret: randomBytes(24).toString('hex'),
        // any redirect will work, injected custom redirect_uri validator below
        redirect_uris: [appConfig.APP_URL],
        response_modes: ['query'],
        // not actually used for oidc, just for logging in for profile management
        response_types: ['none'],
        scope: 'openid',
      }, {
        client_id: 'proxyauth_internal_client',
        // unique every time, never used
        client_secret: randomBytes(24).toString('hex'),
        // special redirect checking logic, injected custom redirect_uri validator below
        redirect_uris: [appConfig.APP_URL],
        response_modes: ['query'],
        // not actually used for oidc, just for logging in for proxy auth
        response_types: ['none'],
        scope: 'openid',
      },
    ],
    clientDefaults: CLIENT_DEFAULTS,
    claims: await getAllClaims(),
    scopes: await getAllScopes(),
    responseTypes: [...RESPONSE_TYPES],
    conformIdTokenClaims: false,
    extraClientMetadata: {
      properties: ['skip_consent', 'require_mfa'],
    },
    issueRefreshToken: (_ctx, client, code) => {
      if (!client.grantTypeAllowed('refresh_token')) {
        return false
      }
      return code.scopes.has('offline_access') || (client.applicationType === 'web' && client.clientAuthMethod === 'none')
    },
    renderError: (ctx, out, _error) => {
    // If ctx status is 403, redirect to forbidden page instead
      if (ctx.status === 403) {
        ctx.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.FORBIDDEN}?reason=${out.error}`)
      } else if (ctx.status === 404) {
        ctx.redirect(`${appConfig.APP_URL}/${REDIRECT_PATHS.NOT_FOUND}`)
      } else {
      // For other errors, show error message
        ctx.body = {
          error: out.error,
          error_description: out.error_description,
        }
      }
    },
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
  } satisfies Configuration

  return configuration
}

async function createProvider(): Promise<[Provider, Configuration]> {
  const config = await getNextConfig()
  const nextProvider = new Provider(`${appConfig.APP_URL}/oidc`, config)
  nextProvider.proxy = true
  // Log provider errors
  nextProvider.on('server_error', (_ctx, error) => {
    logger({ level: 'error', message: 'oidc-provider server error', errors: [{ name: error.name, message: error.message }] })
  })
  nextProvider.on('authorization.error', (_ctx, error) => {
    logger({ level: 'error', message: 'oidc-provider authorization error', errors: [{ name: error.name, message: error.message }] })
  })
  nextProvider.on('backchannel.error', (_ctx, error) => {
    logger({ level: 'error', message: 'oidc-provider backchannel error', errors: [{ name: error.name, message: error.message }] })
  })
  nextProvider.on('jwks.error', (_ctx, error) => {
    logger({ level: 'error', message: 'oidc-provider jwks error', errors: [{ name: error.name, message: error.message }] })
  })
  nextProvider.on('discovery.error', (_ctx, error) => {
    logger({ level: 'error', message: 'oidc-provider discovery error', errors: [{ name: error.name, message: error.message }] })
  })
  nextProvider.on('end_session.error', (_ctx, error) => {
    logger({ level: 'error', message: 'oidc-provider end_session error', errors: [{ name: error.name, message: error.message }] })
  })
  nextProvider.on('grant.error', (_ctx, error) => {
    logger({ level: 'error', message: 'oidc-provider grant error', errors: [{ name: error.name, message: error.message }] })
  })
  nextProvider.on('introspection.error', (_ctx, error) => {
    logger({ level: 'error', message: 'oidc-provider introspection error', errors: [{ name: error.name, message: error.message }] })
  })
  nextProvider.on('pushed_authorization_request.error', (_ctx, error) => {
    logger({
      level: 'error',
      message: 'oidc-provider pushed_authorization_request error',
      errors: [{ name: error.name, message: error.message }],
    })
  })
  nextProvider.on('registration_create.error', (_ctx, error) => {
    logger({ level: 'error', message: 'oidc-provider registration_create error', errors: [{ name: error.name, message: error.message }] })
  })
  nextProvider.on('registration_read.error', (_ctx, error) => {
    logger({ level: 'error', message: 'oidc-provider registration_read error', errors: [{ name: error.name, message: error.message }] })
  })
  nextProvider.on('registration_delete.error', (_ctx, error) => {
    logger({ level: 'error', message: 'oidc-provider registration_delete error', errors: [{ name: error.name, message: error.message }] })
  })
  nextProvider.on('registration_update.error', (_ctx, error) => {
    logger({ level: 'error', message: 'oidc-provider registration_update error', errors: [{ name: error.name, message: error.message }] })
  })
  nextProvider.on('revocation.error', (_ctx, error) => {
    logger({ level: 'error', message: 'oidc-provider revocation error', errors: [{ name: error.name, message: error.message }] })
  })
  nextProvider.on('userinfo.error', (_ctx, error) => {
    logger({ level: 'error', message: 'oidc-provider userinfo error', errors: [{ name: error.name, message: error.message }] })
  })

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const clientSchemaInvalidate = nextProvider.Client.Schema.prototype.invalidate
  // Make sure this exists and library did not change
  assert.ok(clientSchemaInvalidate, 'oidc-provider provider.Client.Schema.prototype.invalidate does not exist.')

  // Split the checks for valid redirectUris for creating Clients
  // into wildcard and non-wildcard
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const clientSchemaRedirectUris = nextProvider.Client.Schema.prototype.redirectUris
  // Make sure this exists and library did not change
  assert.ok(clientSchemaRedirectUris, 'oidc-provider provider.Client.Schema.prototype.redirectUris does not exist.')
  nextProvider.Client.Schema.prototype.redirectUris = function newRedirectUris(uris: string[], label: string = 'redirect_uris') {
    // provide defaults here, use the instance property if caller omitted `uris`
    if (typeof uris === 'undefined') {
      uris = this.redirect_uris
    }

    const regularUris = uris.filter(u => !u.includes('*'))
    clientSchemaRedirectUris.call(this, regularUris, label)

    // Only allowed invalid URL property on wildcard redirect is port
    // See if wildcard uris are valid with dummy port
    const wildcardUris = uris.filter(u => u.includes('*')).map((u) => {
      try {
        const url = wildcardRedirect(u)
        return `${url.protocol}//${url.hostname}${url.port ? `:${url.port.replaceAll('*', '9')}` : ''}${url.pathname}${url.search}${url.hash}`
      } catch (e) {
        const message = `${label} ${e instanceof Error ? e.message : 'must be valid URL.'}`
        clientSchemaInvalidate.call(this, message)
        return u
      }
    })
    clientSchemaRedirectUris.call(this, wildcardUris, label)
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { redirectUriAllowed, postLogoutRedirectUriAllowed } = nextProvider.Client.prototype
  nextProvider.Client.prototype.redirectUriAllowed = function newRedirectUriAllowed(redirectUri) {
    if (Provider.ctx?.oidc.params?.client_id === 'auth_internal_client') {
    // auth_internal_client redirect_uri is allowed if hostname is reachable by session domain
      const redirectURL = URL.parse(redirectUri)
      return !!redirectURL && sessionDomainReaches(redirectURL.hostname)
    }

    // proxyauth_internal_client redirect_uri is formatted like proxyauth callback
    // and proxyauth_url redirect can be reached by session domain
    if (Provider.ctx?.oidc.params?.client_id === 'proxyauth_internal_client') {
      const redirectURL = URL.parse(redirectUri)
      const proxyAuthURLParam = redirectURL?.searchParams.get('proxyauth_url')
      const proxyAuthURL = proxyAuthURLParam ? URL.parse(proxyAuthURLParam) : null
      return !!redirectURL
        && sessionDomainReaches(redirectURL.hostname)
        && redirectURL.pathname.endsWith('/api/proxyauth_cb')
        && !!proxyAuthURL
        && sessionDomainReaches(proxyAuthURL.hostname)
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
  nextProvider.Client.prototype.postLogoutRedirectUriAllowed = function newPostLogoutRedirectUriAllowed(postLogoutRedirectUri: string) {
  // Check if any client postLogoutRedirectUris are a wildcard match
    if (this.postLogoutRedirectUris?.some((r: string) => {
      return r.includes('*') && isMatch(postLogoutRedirectUri, r)
    })) {
      return true
    }

    // Call the default postLogoutRedirectUriAllowed function
    return postLogoutRedirectUriAllowed.call(this, postLogoutRedirectUri)
  }

  updateProviderScopeClaimCache({
    scopes: new Set(config.scopes),
    claims: config.claims,
  })

  return [nextProvider, config]
}

let [_provider, _config] = await createProvider()

export async function resetProvider() {
  [_provider, _config] = await createProvider()
  // No need to clean up old provider, it is stored in a WeakMap
}

/**
 * Expose the current provider instance
 * Should not be stored, may be hot-swapped during a config change
 * @returns the current provider instance
 */
export function provider() {
  return _provider
}

export function getCurrentProviderConfig() {
  return _config
}

/**
 * Provider Utilities
 */

export async function isProviderClaimsDesynced() {
  const currentClaims = await getAllClaims()
  const currentScopes = await getAllScopes()
  const providerConfig = getCurrentProviderConfig()
  const providerClaims = providerConfig.claims ?? {}
  const providerScopes = providerConfig.scopes ?? []

  const claimsDesynced = JSON.stringify(currentClaims) !== JSON.stringify(providerClaims)
  const scopesDesynced = JSON.stringify(currentScopes) !== JSON.stringify(providerScopes)
  return claimsDesynced || scopesDesynced
}

export async function upsertClient(metadata: ClientMetadata, groups: string[], user: Pick<User, 'id'>, ctx: unknown) {
  // Sync scopes for the client
  const scopes = Array.from(new Set(metadata.scope?.split(/\s+/).filter(Boolean) || []))
  if (!scopes.includes('openid')) {
    scopes.push('openid')
  }
  // Make sure that client scopes exist in scopes list
  const customScopes: CustomScope[] = scopes.filter(s => !PROTECTED_SCOPES_SET.has(s)).map(s => ({
    id: randomUUID(),
    scope: s,
    createdAt: new Date(),
    updatedAt: new Date(),
  }))
  if (customScopes[0]) {
    await db().table<CustomScope>(TABLES.CUSTOM_SCOPE).insert(customScopes).onConflict(['scope']).merge(mergeKeys(customScopes[0]))
  }

  // Add any new scopes to the provider by resetting it
  if (await isProviderClaimsDesynced()) {
    await resetProvider()
  }

  await provider().Client.validate(metadata)
  const client = await add(provider(), metadata, { ctx, store: true })
  await provider().Client.validate(client.metadata())
  const clientId = client.clientId

  // Sync groups for the client
  const clientGroups: OIDCGroup[] = (await db().select().table<Group>(TABLES.GROUP).whereIn('name', groups)).map((g) => {
    return {
      groupId: g.id,
      oidcId: clientId,
      oidcType: PayloadTypes.Client,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  })
  if (clientGroups[0]) {
    await db().table<OIDCGroup>(TABLES.OIDC_GROUP).insert(clientGroups)
      .onConflict(['groupId', 'oidcId', 'oidcType']).merge(mergeKeys(clientGroups[0]))
  }
  await db().table<OIDCGroup>(TABLES.OIDC_GROUP).delete()
    .where({ oidcId: clientId }).and
    .whereNotIn('groupId', clientGroups.map(g => g.groupId))

  // Clean up scopes
  await cleanUnreferencedCustomClaims()
  // If scopes are not synced with provider, reset provider
  if (await isProviderClaimsDesynced()) {
    await resetProvider()
  }

  return client
}

export async function removeClient(client_id: string) {
  // @ts-expect-error client adapter actually does exist
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  await provider().Client.adapter.destroy(client_id)
}

export async function getSession(req: IncomingMessage, res: ServerResponse) {
  try {
    const ctx = provider().createContext(req, res)
    return await provider().Session.get(ctx)
  } catch (_e) {
    return null
  }
}
