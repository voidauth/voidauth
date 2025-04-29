export const ADMIN_GROUP = 'auth_admins' as const
export const ADMIN_USER = 'auth_admin' as const

export const USERNAME_REGEX = /^[A-Za-z0-9_]{4,32}$/

// Paths that the server might redirect the frontend toward
export const REDIRECT_PATHS = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  APPROVAL_REQUIRED: 'approval_required',
  VERIFICATION_EMAIL_SENT: 'verification_email_sent',
  VERIFY_EMAIL: 'verify_email',
  REGISTER: 'register',
  INVITE: 'invite', // registration page also
} as const

// Key types for the key table
export const KEY_TYPES = {
  OIDC_JWK: 'oidc_jwk',
  COOKIE_KEY: 'cookie_key',
} as const

// Time-to-Live(s) in seconds
const HOUR = 60 * 60
const DAY = HOUR * 24
const WEEK = DAY * 7
export const TTLs = {
  VERIFICATION_EMAIL: 2 * HOUR,
  INVITATION: 1 * WEEK,
  CONSENT: 52 * WEEK,

  OIDC_JWK: 2 * WEEK,
  COOKIE_KEY: 2 * WEEK,
} as const

// TODO: Make sure TTLs are valid and will not conflict
