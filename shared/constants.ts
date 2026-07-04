export const ADMIN_GROUP = 'auth_admins' as const
export const ADMIN_USER = 'auth_admin' as const

export const USERNAME_REGEX = /^[A-Za-z0-9_]{1,32}$/
export const CUSTOM_CLAIM_SCOPE_REGEX = /^[A-Za-z0-9._:~-]+$/
export const CUSTOM_CLAIM_CLAIM_REGEX = /^[a-zA-Z0-9_]+$/

// Paths that the server might redirect the frontend toward
export const REDIRECT_PATHS = {
  LOGIN: 'login',
  FORGOT_PASSWORD: 'forgot_password',
  RESET_PASSWORD: 'reset_password',
  LOGOUT: 'logout',
  APPROVAL_REQUIRED: 'approval_required',
  USER_EXPIRED: 'user_expired',
  VERIFICATION_EMAIL_SENT: 'verification_email_sent',
  VERIFY_EMAIL: 'verify_email',
  REGISTER: 'register',
  INVITE: 'invite', // registration page also
  MFA: 'mfa',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not-found',
} as const

export const FORBIDDEN_PATHS = [REDIRECT_PATHS.FORBIDDEN, REDIRECT_PATHS.APPROVAL_REQUIRED, REDIRECT_PATHS.USER_EXPIRED] as const

export const NOT_FOUND_PATHS = [REDIRECT_PATHS.NOT_FOUND] as const

// Key types for the key table
export const KEY_TYPES = {
  OIDC_JWK: 'oidc_jwk',
  COOKIE_KEY: 'cookie_key',
} as const

// Time-to-Live(s) in seconds
const MINUTE = 60
const HOUR = MINUTE * 60
const DAY = HOUR * 24
const WEEK = DAY * 7
const YEAR = DAY * 365
export const TTLs = {
  VERIFICATION_EMAIL: 2 * HOUR,
  PASSWORD_RESET: 2 * HOUR,
  INVITATION: 1 * WEEK,
  CONSENT: 1 * YEAR,
  PASSKEY_REGISTRATION: 10 * MINUTE,
  PASSKEY_AUTHN: 5 * MINUTE,
  TOTP_VERIFICATION: 10 * MINUTE,

  // OIDC TTLs
  INTERACTION: 1 * HOUR,
  SESSION: 1 * YEAR,
  GRANT: 1 * YEAR,

  // Should be longer than or equal to any OIDC TTLs
  OIDC_JWK: 1 * YEAR,
  COOKIE_KEY: 1 * YEAR,

  // Util
  DAY: 1 * DAY,
  YEAR: 1 * YEAR,
} as const

export const PROTECTED_SCOPES = [
  'openid',
  'offline_access',
  'address',
  'email',
  'phone',
  'profile',

  'groups',
  'group',
  'roles',
  'role',
] as const

export const PROTECTED_SCOPES_SET = new Set<string>(PROTECTED_SCOPES)

export const PROTECTED_CLAIMS = [
  'iss',
  'sub',
  'sid',
  'aud',
  'exp',
  'iat',
  'auth_time',
  'nonce',
  'acr',
  'amr',
  'azp',

  'address',

  'email',
  'email_verified',

  'phone_number',
  'phone_number_verified',

  'birthdate',
  'family_name',
  'gender',
  'given_name',
  'locale',
  'middle_name',
  'name',
  'nickname',
  'picture',
  'preferred_username',
  'profile',
  'updated_at',
  'website',
  'zoneinfo',

  'groups',
  'group',
  'roles',
  'role',
] as const

export const PROTECTED_CLAIMS_SET = new Set<string>(PROTECTED_CLAIMS)

const _CLIENT_DEFAULTS = {
  scope: 'openid offline_access profile email groups',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: [
    'code',
    'none',
  ],
} as const

export const CLIENT_DEFAULTS = {
  scope: _CLIENT_DEFAULTS.scope,
  grant_types: [..._CLIENT_DEFAULTS.grant_types],
  response_types: [..._CLIENT_DEFAULTS.response_types],
}
