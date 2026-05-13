import type { ValueOf } from './utils'

export const TABLES = {
  KEY: 'key',
  FLAG: 'flag',
  USER: 'user',
  GROUP: 'group',
  USER_GROUP: 'user_group',
  CONSENT: 'consent',
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
  INVITATION: 'invitation',
  INVITATION_GROUP: 'invitation_group',
  PROXY_AUTH: 'proxy_auth',
  PROXY_AUTH_GROUP: 'proxy_auth_group',
  OIDC_PAYLOADS: 'oidc_payloads',
  PASSKEY: 'passkey',
  PASSKEY_REGISTRATION: 'passkey_registration',
  PASSKEY_AUTHENTICATION: 'passkey_authentication',
  EMAIL_LOG: 'email_log',
  OIDC_GROUP: 'oidc_group',
  TOTP: 'totp',
} as const

export const TABLES_ORDER: ValueOf<typeof TABLES>[] = [
  TABLES.KEY,
  TABLES.FLAG,
  TABLES.USER,
  TABLES.GROUP,
  TABLES.USER_GROUP,
  TABLES.CONSENT,
  TABLES.EMAIL_VERIFICATION,
  TABLES.PASSWORD_RESET,
  TABLES.INVITATION,
  TABLES.INVITATION_GROUP,
  TABLES.PROXY_AUTH,
  TABLES.PROXY_AUTH_GROUP,
  TABLES.OIDC_PAYLOADS,
  TABLES.PASSKEY,
  TABLES.PASSKEY_REGISTRATION,
  TABLES.PASSKEY_AUTHENTICATION,
  TABLES.EMAIL_LOG,
  TABLES.OIDC_GROUP,
  TABLES.TOTP,
] as const

if (!Object.values(TABLES).every(t => TABLES_ORDER.includes(t))) {
  throw new Error('Migration tables list is missing tables.')
}

export const BOOL_COLUMNS = ['emailVerified', 'approved', 'backedUp', 'mfaRequired', 'autoAssign'] as const
export const DATE_COLUMNS = ['createdAt', 'updatedAt', 'expiresAt', 'lastUsed', 'userExpiresAt', 'consumedAt'] as const

// Helpers to make sure all boolean and date columns are included in BOOL_COLUMNS and DATE_COLUMNS
// And that any column in those lists are the correct type
type KeysWithTypePart<T, U> = { [K in keyof T]-?: Extract<T[K], U> extends never ? never : K }[keyof T]
type AllBoolKeysListed<T extends Record<string, unknown>> = KeysWithTypePart<T, boolean> extends ValueOf<typeof BOOL_COLUMNS> ? true : never
type AllDateKeysListed<T extends Record<string, unknown>> = KeysWithTypePart<T, Date> extends ValueOf<typeof DATE_COLUMNS> ? true : never
type KeysCorrectType<T extends Record<string, unknown>> = T extends {
  [key in typeof BOOL_COLUMNS[number]]?: boolean | number | null
} & {
  [key in typeof DATE_COLUMNS[number]]?: Date | number | null
} ? true : never

export type DBColumnTypesCheck<T extends Record<string, unknown>> = AllBoolKeysListed<T> & AllDateKeysListed<T> & KeysCorrectType<T>
