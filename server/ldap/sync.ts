/**
 * LDAP Sync — pulls users and groups from an external LDAP directory
 * and synchronises them into the VoidAuth database on a configurable
 * interval.  Synced users authenticate via LDAP bind rather than
 * local password hashes.
 *
 * Exports:
 *   syncLDAP()              — full user + group sync cycle
 *   verifyLDAPPassword()    — single-credential LDAP bind check,
 *                             used by checkPasswordHash() at login
 */
import { Client, InvalidCredentialsError } from 'ldapts'
import type { Entry } from 'ldapts'
import appConfig from '../util/config'
import { db } from '../db/db'
import { TABLES } from '@shared/db'
import { ADMIN_GROUP } from '@shared/constants'
import type { User } from '@shared/db/User'
import type { Group, UserGroup } from '@shared/db/Group'
import { logger } from '../util/logger'
import { randomUUID } from 'node:crypto'
import { parseDN } from './util'

/**
 * Value stored in the ldapSource column on user / group rows to
 * indicate the row was created and is managed by the LDAP sync.
 */
const LDAP_SOURCE = 'ldap'

/**
 * Extract the first string value of an LDAP entry attribute.
 * Handles both single-value (string) and multi-value (string[])
 * representations returned by the ldapts library.
 */
function getStringAttribute(entry: Entry, attrName: string): string | undefined {
  const value = entry[attrName]
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return value[0]
  }
  return undefined
}

/**
 * Extract all string values of an LDAP entry attribute as an array.
 * Single-value attributes are wrapped in a one-element array.
 */
function getStringArrayAttribute(entry: Entry, attrName: string): string[] {
  const value = entry[attrName]
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string')
  }
  if (typeof value === 'string') {
    return [value]
  }
  return []
}

/**
 * Create an ldapts Client configured from LDAP_SYNC_* env vars.
 * TLS certificate verification is only disabled when
 * LDAP_SYNC_SKIP_CERT_VERIFICATION is true.
 */
function createLDAPClient(): Client {
  const baseOpts = {
    url: appConfig.LDAP_SYNC_URL as string,
    connectTimeout: 5000,
  }

  if (appConfig.LDAP_SYNC_SKIP_CERT_VERIFICATION) {
    return new Client({
      ...baseOpts,
      tlsOptions: { rejectUnauthorized: false },
    })
  }

  return new Client(baseOpts)
}

/**
 * Use an entry's full DN as its external identifier.
 * DNs are required for LDAP bind authentication and group
 * membership resolution.
 */
function parseDNToExternalId(dn: string): string {
  return dn
}

/**
 * Extract the raw DN string from a group member attribute value.
 * Some LDAP implementations wrap the value — override as needed.
 */
function extractMemberDN(value: string): string {
  return value
}

/**
 * Check whether a group DN (from a user's memberOf attribute)
 * matches the configured admin group name.  Parses the first RDN
 * of the DN and compares its CN value case-insensitively.
 */
function groupDNMatchesAdminGroup(dn: string, adminGroupName: string): boolean {
  try {
    const parsed = parseDN(dn)
    if (!parsed || parsed.length === 0) {
      return false
    }
    const firstRDN = parsed[0]
    if (!firstRDN) {
      return false
    }
    const cnEntry = firstRDN.find(([attr]) => attr === 'cn')
    return !!cnEntry && cnEntry[1] === adminGroupName.toLowerCase()
  } catch {
    return false
  }
}

/**
 * Authenticate a user against the external LDAP directory by
 * attempting a simple bind with the given DN and password.
 * Called from checkPasswordHash() whenever the user has
 * ldapSource = 'ldap' and a non-empty ldapExternalId.
 *
 * Returns true if the bind succeeds (credentials valid),
 * false otherwise (wrong password, connection error, etc.).
 */
export async function verifyLDAPPassword(userDN: string, password: string): Promise<boolean> {
  if (!appConfig.LDAP_SYNC_ENABLED || !appConfig.LDAP_SYNC_URL || !password || !userDN) {
    return false
  }

  if (!userDN.includes('=')) {
    logger({
      level: 'error',
      message: `LDAP bind skipped: stored externalId is not a valid DN: "${userDN}". Re-sync may be needed after code update.`,
    })
    return false
  }

  let client: Client | undefined

  try {
    client = createLDAPClient()

    await client.bind(userDN, password)

    return true
  } catch (e) {
    if (e instanceof InvalidCredentialsError) {
      logger({
        level: 'debug',
        message: `LDAP bind failed: invalid credentials for DN: ${userDN}`,
      })
    } else {
      logger({
        level: 'error',
        message: `LDAP bind error for DN: ${userDN}`,
        errors: e instanceof Error ? [e] : [{ message: String(e) }],
      })
    }
    return false
  } finally {
    if (client) {
      try {
        await client.unbind()
      } catch {
        // ignore unbind errors
      }
    }
  }
}

/**
 * Run a full LDAP synchronisation cycle:
 *   1. Bind to the remote LDAP server with the service account.
 *   2. Fetch all matching user and group entries.
 *   3. Sync users (create / update / link by DN).
 *   4. Sync groups and their member associations.
 *   5. Handle users no longer present in LDAP.
 *   6. Assign VoidAuth admin group to matching LDAP users.
 */
export async function syncLDAP(): Promise<void> {
  if (!appConfig.LDAP_SYNC_ENABLED) {
    return
  }

  logger({
    level: 'info',
    message: 'Starting LDAP sync',
  })

  let client: Client | undefined

  try {
    client = createLDAPClient()

    await client.bind(appConfig.LDAP_SYNC_BIND_DN as string, appConfig.LDAP_SYNC_BIND_PASSWORD)

    logger({
      level: 'debug',
      message: 'LDAP sync: bound successfully',
    })

    const ldapUsers = await fetchLDAPUsers(client)
    const ldapGroups = await fetchLDAPGroups(client)

    const syncedUserIds = await syncUsers(ldapUsers)
    await syncGroups(ldapGroups, syncedUserIds)
    await handleRemovedUsers(syncedUserIds)
    await assignAdminGroupToAdminLDAPUsers(ldapUsers)

    logger({
      level: 'info',
      message: `LDAP sync completed: ${String(syncedUserIds.size)} users, ${String(ldapGroups.length)} groups synced`,
    })
  } catch (e) {
    logger({
      level: 'error',
      message: 'LDAP sync failed',
      errors: e instanceof Error ? [e] : [{ message: String(e) }],
    })
  } finally {
    if (client) {
      try {
        await client.unbind()
      } catch {
        // ignore unbind errors
      }
    }
  }
}

/**
 * Search the remote LDAP directory for user entries matching
 * LDAP_SYNC_USER_SEARCH_FILTER under LDAP_SYNC_BASE_DN.
 * Requests all configured attribute mappings plus memberOf
 * (needed for admin group detection) and the entry DN.
 */
async function fetchLDAPUsers(client: Client): Promise<Entry[]> {
  const baseDN = appConfig.LDAP_SYNC_BASE_DN as string
  const filter = appConfig.LDAP_SYNC_USER_SEARCH_FILTER

  const attributes = [
    appConfig.LDAP_SYNC_USER_UNIQUE_ID_ATTRIBUTE,
    appConfig.LDAP_SYNC_USERNAME_ATTRIBUTE ?? 'uid',
    appConfig.LDAP_SYNC_USER_MAIL_ATTRIBUTE ?? 'mail',
    appConfig.LDAP_SYNC_USER_FIRSTNAME_ATTRIBUTE ?? 'givenName',
    appConfig.LDAP_SYNC_USER_LASTNAME_ATTRIBUTE ?? 'sn',
    'memberOf',
    'dn',
  ].filter((a): a is string => typeof a === 'string')

  const result = await client.search(baseDN, {
    scope: 'sub',
    filter,
    attributes,
  })

  return result.searchEntries.filter(e => !!e.dn)
}

/**
 * Search the remote LDAP directory for group entries matching
 * LDAP_SYNC_GROUPS_SEARCH_FILTER under LDAP_SYNC_BASE_DN.
 */
async function fetchLDAPGroups(client: Client): Promise<Entry[]> {
  const baseDN = appConfig.LDAP_SYNC_BASE_DN as string
  const filter = appConfig.LDAP_SYNC_GROUPS_SEARCH_FILTER

  const attributes = [
    appConfig.LDAP_SYNC_GROUP_UNIQUE_IDENTIFIER_ATTRIBUTE,
    appConfig.LDAP_SYNC_GROUP_NAME_ATTRIBUTE ?? 'cn',
    appConfig.LDAP_SYNC_GROUP_MEMBERS_ATTRIBUTE ?? 'member',
    'dn',
  ].filter((a): a is string => typeof a === 'string')

  const result = await client.search(baseDN, {
    scope: 'sub',
    filter,
    attributes,
  })

  return result.searchEntries.filter(e => !!e.dn)
}

/**
 * Iterate over every LDAP user entry and create or update the
 * corresponding VoidAuth user.  Returns the set of all VoidAuth
 * user IDs that were present in this sync cycle (used later to
 * detect removed users).
 */
async function syncUsers(ldapUsers: Entry[]): Promise<Set<string>> {
  const syncedUserIds = new Set<string>()

  for (const ldapUser of ldapUsers) {
    try {
      const userId = await syncSingleUser(ldapUser)
      if (userId) {
        syncedUserIds.add(userId)
      }
    } catch (e) {
      const dn = ldapUser.dn || 'unknown'
      logger({
        level: 'error',
        message: `LDAP sync: failed to sync user ${dn}`,
        errors: e instanceof Error ? [e] : [{ message: String(e) }],
      })
    }
  }

  return syncedUserIds
}

/**
 * Sync a single LDAP user entry into VoidAuth.
 *
 * Matching order:
 *   1. Look up by ldapExternalId (the user's full LDAP DN).
 *      If found → update username / email / name, mark approved.
 *   2. Look up by username (case-insensitive).
 *      If found AND the existing user has no ldapExternalId yet
 *      (i.e. was created manually or through invitation) → link
 *      the account by setting ldapSource / ldapExternalId.
 *   3. Neither found → create a brand-new VoidAuth user with
 *      approved = true, emailVerified = true, empty passwordHash.
 *
 * Returns the VoidAuth user ID on success, undefined if the
 * entry was skipped (missing username attribute, etc.).
 */
async function syncSingleUser(ldapUser: Entry): Promise<string | undefined> {
  const usernameAttr = appConfig.LDAP_SYNC_USERNAME_ATTRIBUTE ?? 'uid'
  const username = getStringAttribute(ldapUser, usernameAttr)
  if (!username) {
    logger({
      level: 'debug',
      message: `LDAP sync: skipping user without username attribute (${usernameAttr}), DN: ${ldapUser.dn}`,
    })
    return undefined
  }

  const externalId = ldapUser.dn
  const email = getStringAttribute(ldapUser, appConfig.LDAP_SYNC_USER_MAIL_ATTRIBUTE ?? 'mail') || undefined
  const firstName = getStringAttribute(ldapUser, appConfig.LDAP_SYNC_USER_FIRSTNAME_ATTRIBUTE ?? 'givenName') || undefined
  const lastName = getStringAttribute(ldapUser, appConfig.LDAP_SYNC_USER_LASTNAME_ATTRIBUTE ?? 'sn') || undefined

  const nameParts = [firstName, lastName].filter(Boolean)
  const name = nameParts.length > 0 ? nameParts.join(' ') : undefined

  const existingByExternalId = await db().table<User>(TABLES.USER)
    .select('id')
    .where({ ldapExternalId: externalId })
    .first()

  if (existingByExternalId) {
    await db().table<User>(TABLES.USER)
      .update({
        username,
        email: email ?? null,
        name: name ?? null,
        approved: true,
        updatedAt: new Date(),
      })
      .where({ id: existingByExternalId.id })

    return existingByExternalId.id
  }

  const existingByUsername = await db().table<User>(TABLES.USER)
    .select('id', 'ldapExternalId')
    .whereRaw('lower("username") = lower(?)', [username])
    .first()

  if (existingByUsername) {
    if (!existingByUsername.ldapExternalId) {
      await db().table<User>(TABLES.USER)
        .update({
          ldapSource: LDAP_SOURCE,
          ldapExternalId: externalId,
          email: email ?? null,
          name: name ?? null,
          approved: true,
          updatedAt: new Date(),
        })
        .where({ id: existingByUsername.id })
    }

    return existingByUsername.id
  }

  const id = randomUUID()
  await db().table<User>(TABLES.USER).insert({
    id,
    username,
    email: email ?? null,
    name: name ?? null,
    passwordHash: '',
    emailVerified: true,
    approved: true,
    mfaRequired: false,
    ldapSource: LDAP_SOURCE,
    ldapExternalId: externalId,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  return id
}

/**
 * Iterate over every LDAP group entry and sync it into VoidAuth.
 */
async function syncGroups(ldapGroups: Entry[], syncedUserIds: Set<string>): Promise<void> {
  for (const ldapGroup of ldapGroups) {
    try {
      await syncSingleGroup(ldapGroup, syncedUserIds)
    } catch (e) {
      const dn = ldapGroup.dn || 'unknown'
      logger({
        level: 'error',
        message: `LDAP sync: failed to sync group ${dn}`,
        errors: e instanceof Error ? [e] : [{ message: String(e) }],
      })
    }
  }
}

/**
 * Sync a single LDAP group entry into VoidAuth.
 *
 * - Creates or updates the group row (keyed by ldapExternalId).
 * - Resolves each member DN to a VoidAuth user via ldapExternalId.
 * - Adds new members and removes stale ones from user_group.
 */
async function syncSingleGroup(ldapGroup: Entry, _syncedUserIds: Set<string>): Promise<void> {
  const groupNameAttr = appConfig.LDAP_SYNC_GROUP_NAME_ATTRIBUTE ?? 'cn'
  const groupName = getStringAttribute(ldapGroup, groupNameAttr)
  if (!groupName) {
    logger({
      level: 'debug',
      message: `LDAP sync: skipping group without name attribute (${groupNameAttr}), DN: ${ldapGroup.dn}`,
    })
    return
  }

  const groupUniqueIdAttr = appConfig.LDAP_SYNC_GROUP_UNIQUE_IDENTIFIER_ATTRIBUTE ?? 'entryUUID'
  const externalId = getStringAttribute(ldapGroup, groupUniqueIdAttr) || parseDNToExternalId(ldapGroup.dn)

  const memberDNs = getStringArrayAttribute(ldapGroup, appConfig.LDAP_SYNC_GROUP_MEMBERS_ATTRIBUTE ?? 'member')
    .map(extractMemberDN)

  const existingGroup = await db().table<Group>(TABLES.GROUP)
    .select('id', 'ldapExternalId')
    .where({ ldapExternalId: externalId })
    .first()

  let groupId: string

  if (existingGroup) {
    groupId = existingGroup.id

    await db().table<Group>(TABLES.GROUP)
      .update({
        name: groupName,
        ldapSource: LDAP_SOURCE,
        updatedAt: new Date(),
      })
      .where({ id: groupId })
  } else {
    groupId = randomUUID()

    await db().table<Group>(TABLES.GROUP).insert({
      id: groupId,
      name: groupName,
      mfaRequired: false,
      autoAssign: false,
      ldapSource: LDAP_SOURCE,
      ldapExternalId: externalId,
      createdBy: '00000000-0000-0000-0000-000000000000',
      updatedBy: '00000000-0000-0000-0000-000000000000',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  const memberUserIds: string[] = []

  for (const memberDN of memberDNs) {
    const user = await db().table<User>(TABLES.USER)
      .select('id')
      .where({ ldapExternalId: memberDN })
      .first()

    if (user) {
      memberUserIds.push(user.id)
    }
  }

  const existingMembers = await db().table<UserGroup>(TABLES.USER_GROUP)
    .select('userId')
    .where({ groupId: groupId })

  const existingMemberIds = new Set(existingMembers.map(m => m.userId))
  const newMemberIds = new Set(memberUserIds)

  for (const userId of newMemberIds) {
    if (!existingMemberIds.has(userId)) {
      await db().table<UserGroup>(TABLES.USER_GROUP)
        .insert({
          userId,
          groupId,
          createdBy: '00000000-0000-0000-0000-000000000000',
          updatedBy: '00000000-0000-0000-0000-000000000000',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflict(['userId', 'groupId'])
        .merge(['updatedAt', 'updatedBy'])
    }
  }

  for (const userId of existingMemberIds) {
    if (!newMemberIds.has(userId)) {
      await db().table<UserGroup>(TABLES.USER_GROUP)
        .delete()
        .where({ userId, groupId })
    }
  }
}

/**
 * Handle LDAP-synced users that were NOT present in the current
 * sync cycle (they may have been disabled or deleted in LDAP).
 *
 * LDAP_SYNC_KEEP_DISABLED_USERS = true  → set approved = false,
 *   expiresAt = now (user can no longer log in but data is kept).
 * LDAP_SYNC_KEEP_DISABLED_USERS = false → DELETE the VoidAuth user.
 */
async function handleRemovedUsers(syncedUserIds: Set<string>): Promise<void> {
  const ldapUsers = await db().table<User>(TABLES.USER)
    .select('id')
    .where({ ldapSource: LDAP_SOURCE })

  for (const user of ldapUsers) {
    if (!syncedUserIds.has(user.id)) {
      if (appConfig.LDAP_SYNC_KEEP_DISABLED_USERS) {
        await db().table<User>(TABLES.USER)
          .update({
            approved: false,
            expiresAt: new Date(),
            updatedAt: new Date(),
          })
          .where({ id: user.id })

        logger({
          level: 'info',
          message: `LDAP sync: disabled user no longer in LDAP: ${user.id}`,
        })
      } else {
        await db().table<User>(TABLES.USER)
          .delete()
          .where({ id: user.id })

        logger({
          level: 'info',
          message: `LDAP sync: deleted user no longer in LDAP: ${user.id}`,
        })
      }
    }
  }
}

/**
 * If LDAP_SYNC_ADMIN_GROUP_NAME is configured, find all LDAP
 * users whose memberOf attribute includes a group with a matching
 * CN and add them to VoidAuth's built-in auth_admins group.
 */
async function assignAdminGroupToAdminLDAPUsers(ldapUsers: Entry[]): Promise<void> {
  if (!appConfig.LDAP_SYNC_ADMIN_GROUP_NAME) {
    return
  }

  const adminGroup = await db().table<Group>(TABLES.GROUP)
    .select('id')
    .where({ name: ADMIN_GROUP })
    .first()

  if (!adminGroup) {
    return
  }

  const adminGroupName = appConfig.LDAP_SYNC_ADMIN_GROUP_NAME

  const adminLDAPUsers = ldapUsers.filter((u) => {
    const memberOf = getStringArrayAttribute(u, 'memberOf')
    return memberOf.some(dn => groupDNMatchesAdminGroup(dn, adminGroupName))
  })

  for (const ldapUser of adminLDAPUsers) {
    const user = await db().table<User>(TABLES.USER)
      .select('id')
      .where({ ldapExternalId: ldapUser.dn })
      .first()

    if (!user) {
      continue
    }

    await db().table<UserGroup>(TABLES.USER_GROUP)
      .insert({
        userId: user.id,
        groupId: adminGroup.id,
        createdBy: '00000000-0000-0000-0000-000000000000',
        updatedBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflict(['userId', 'groupId'])
      .merge(['updatedAt', 'updatedBy'])
  }
}
