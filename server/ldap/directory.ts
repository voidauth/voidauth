import { createHash } from 'node:crypto'
import { db } from '../db/db'
import type { User } from '@shared/db/User'
import type { Group, UserGroup } from '@shared/db/Group'
import { TABLES } from '@shared/db'
import appConfig from '../util/config'
import { ADMIN_GROUP } from '@shared/constants'
import { isExpired, isUnapproved, isUnverifiedEmail } from '@shared/user'

export type LDAPAttributes = Record<string, string | string[]>

export type LDAPEntry = {
  dn: string
  attributes: LDAPAttributes
}

export type LDAPSearchScope = 'base' | 'one' | 'sub' | 0 | 1 | 2

type UserGroupMembership = Pick<UserGroup, 'userId' | 'groupId'>

export function usersBaseDN() {
  return `${rdn('ou', appConfig.LDAP_USERS_OU)},${appConfig.LDAP_BASE_DN}`
}

export function groupsBaseDN() {
  return `${rdn('ou', appConfig.LDAP_GROUPS_OU)},${appConfig.LDAP_BASE_DN}`
}

export function ldapUserDN(user: Pick<User, 'username'>) {
  return `${rdn('uid', user.username)},${usersBaseDN()}`
}

export function ldapGroupDN(group: Pick<Group, 'name'>) {
  return `${rdn('cn', group.name)},${groupsBaseDN()}`
}

export function dnEqual(a: string, b: string) {
  return normalizeDN(a) === normalizeDN(b)
}

export async function getLDAPEntries(): Promise<LDAPEntry[]> {
  const [users, groups, memberships] = await Promise.all([
    db().table<User>(TABLES.USER).select(),
    db().table<Group>(TABLES.GROUP).select(),
    db().table<UserGroup>(TABLES.USER_GROUP).select('userId', 'groupId') as Promise<UserGroupMembership[]>,
  ])

  const groupsById = new Map(groups.map(group => [group.id, group]))
  const groupNamesByUserId = new Map<string, string[]>()
  const userIdsByGroupId = new Map<string, string[]>()

  for (const membership of memberships) {
    const group = groupsById.get(membership.groupId)
    if (group) {
      groupNamesByUserId.set(membership.userId, [...(groupNamesByUserId.get(membership.userId) ?? []), group.name])
      userIdsByGroupId.set(membership.groupId, [...(userIdsByGroupId.get(membership.groupId) ?? []), membership.userId])
    }
  }

  const activeUsers = users.filter(user => userVisibleInLDAP(user, groupNamesByUserId.get(user.id) ?? []))
  const activeUsersById = new Map(activeUsers.map(user => [user.id, user]))

  const entries: LDAPEntry[] = [
    rootDSEEntry(),
    baseEntry(),
    organizationalUnitEntry(appConfig.LDAP_USERS_OU, usersBaseDN()),
    organizationalUnitEntry(appConfig.LDAP_GROUPS_OU, groupsBaseDN()),
  ]

  for (const user of activeUsers) {
    entries.push(userEntry(user, groupNamesByUserId.get(user.id) ?? []))
  }

  for (const group of groups) {
    const groupUsers = (userIdsByGroupId.get(group.id) ?? [])
      .map(userId => activeUsersById.get(userId))
      .filter((user): user is User => !!user)

    entries.push(groupEntry(group, groupUsers))
  }

  return entries
}

export async function getLDAPEntryByDN(dn: string): Promise<LDAPEntry | undefined> {
  return (await getLDAPEntries()).find(entry => dnEqual(entry.dn, dn))
}

export async function getLDAPUserByDN(dn: string): Promise<User | undefined> {
  const users = await db().table<User>(TABLES.USER).select()
  return users.find(user => dnEqual(ldapUserDN(user), dn))
}

export function entryInScope(baseDN: string, entryDN: string, scope: LDAPSearchScope) {
  const base = parseDN(baseDN)
  const entry = parseDN(entryDN)

  if (!base || !entry) {
    return false
  }

  switch (searchScope(scope)) {
    case 'base':
      return rdnsEqual(entry, base)
    case 'one':
      return entry.length === base.length + 1 && dnEndsWith(entry, base)
    case 'sub':
      return rdnsEqual(entry, base) || dnEndsWith(entry, base)
  }
}

export function searchScope(scope: LDAPSearchScope): 'base' | 'one' | 'sub' {
  switch (scope) {
    case 0:
    case 'base':
      return 'base'
    case 1:
    case 'one':
      return 'one'
    case 2:
    case 'sub':
      return 'sub'
  }
}

function rootDSEEntry(): LDAPEntry {
  return {
    dn: '',
    attributes: attrs({
      objectClass: ['top'],
      namingContexts: [appConfig.LDAP_BASE_DN],
      supportedLDAPVersion: ['3'],
      supportedFeatures: ['1.3.6.1.4.1.4203.1.5.1'],
      vendorName: 'VoidAuth',
      vendorVersion: 'VoidAuth',
    }),
  }
}

function baseEntry(): LDAPEntry {
  return {
    dn: appConfig.LDAP_BASE_DN,
    attributes: attrs({
      objectClass: ['top', 'dcObject', 'organization'],
      dc: firstDcValue(appConfig.LDAP_BASE_DN),
      o: appConfig.APP_TITLE,
    }),
  }
}

function organizationalUnitEntry(ou: string, dn: string): LDAPEntry {
  return {
    dn,
    attributes: attrs({
      objectClass: ['top', 'organizationalUnit'],
      ou,
    }),
  }
}

function userEntry(user: User, groupNames: string[]): LDAPEntry {
  const cn = user.name || user.username
  const groupDNs = groupNames.map(name => ldapGroupDN({ name })).sort((a, b) => a.localeCompare(b))

  return {
    dn: ldapUserDN(user),
    attributes: attrs({
      objectClass: ['top', 'person', 'organizationalPerson', 'inetOrgPerson', 'posixAccount'],
      entryUUID: user.id,
      uid: user.username,
      cn,
      sn: surname(cn),
      displayName: cn,
      givenName: givenName(cn),
      mail: user.email,
      uidNumber: numericId(user.id),
      gidNumber: numericId(appConfig.LDAP_BASE_DN),
      homeDirectory: `/home/${user.username}`,
      loginShell: '/bin/false',
      memberOf: groupDNs,
      isMemberOf: groupDNs,
      voidAuthApproved: String(!!user.approved),
      voidAuthEmailVerified: String(!!user.emailVerified),
    }),
  }
}

function groupEntry(group: Group, users: User[]): LDAPEntry {
  const members = users.map(user => ldapUserDN(user)).sort((a, b) => a.localeCompare(b))

  return {
    dn: ldapGroupDN(group),
    attributes: attrs({
      objectClass: ['top', 'groupOfNames', 'groupOfUniqueNames', 'posixGroup'],
      entryUUID: group.id,
      cn: group.name,
      description: group.name,
      gidNumber: numericId(group.id),
      member: members,
      uniqueMember: members,
      memberUid: users.map(user => user.username).sort((a, b) => a.localeCompare(b)),
    }),
  }
}

function userVisibleInLDAP(user: User, groupNames: string[]) {
  const state = {
    approved: !!user.approved,
    emailVerified: !!user.emailVerified,
    expiresAt: user.expiresAt ?? null,
    hasEmail: !!user.email,
    isAdmin: groupNames.some(name => name === ADMIN_GROUP),
  }

  return !isUnapproved(state, appConfig.SIGNUP_REQUIRES_APPROVAL)
    && !isExpired(state)
    && !isUnverifiedEmail(state, !!appConfig.EMAIL_VERIFICATION)
}

function attrs(input: Record<string, string | string[] | undefined | null>): LDAPAttributes {
  const output: LDAPAttributes = {}

  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      if (value.length) {
        output[key] = value
      }
    } else if (value != null && value !== '') {
      output[key] = value
    }
  }

  return output
}

function rdn(attribute: string, value: string) {
  return `${escapeDNValue(attribute)}=${escapeDNValue(value)}`
}

function firstDcValue(baseDN: string) {
  return /^dc=([^,]+)/i.exec(baseDN)?.[1] ?? appConfig.APP_TITLE
}

function surname(name: string) {
  return name.trim().split(/\s+/).at(-1) || name
}

function givenName(name: string) {
  return name.trim().split(/\s+/).at(0) || name
}

function numericId(input: string) {
  const hash = createHash('sha256').update(input).digest()
  return String(10000 + (hash.readUInt32BE(0) % 2000000000))
}

function normalizeDN(dn: string) {
  const parsed = parseDN(dn)
  return parsed
    ? parsed.map(rdn => rdn.map(([name, value]) => `${name}=${value}`).join('+')).join(',')
    : dn.trim().toLowerCase()
}

function parseDN(dn: string) {
  const input = dn.trim()

  if (!input) {
    return []
  }

  const rdns = splitUnescaped(input, ',').map(part => splitUnescaped(part, '+').map((attributeValue) => {
    const equalsIndex = findUnescaped(attributeValue, '=')

    if (equalsIndex < 1) {
      return undefined
    }

    return [
      attributeValue.slice(0, equalsIndex).trim().toLowerCase(),
      unescapeDNValue(attributeValue.slice(equalsIndex + 1).trim()).toLowerCase(),
    ] as [string, string]
  }))

  if (rdns.some(rdn => rdn.some(value => !value))) {
    return undefined
  }

  return rdns as [string, string][][]
}

function rdnsEqual(a: [string, string][][], b: [string, string][][]) {
  return a.length === b.length && dnEndsWith(a, b)
}

function dnEndsWith(dn: [string, string][][], suffix: [string, string][][]) {
  if (suffix.length > dn.length) {
    return false
  }

  const offset = dn.length - suffix.length
  return suffix.every((rdn, index) => {
    const entryRDN = dn[offset + index]
    return !!entryRDN && rdnEqual(entryRDN, rdn)
  })
}

function rdnEqual(a: [string, string][], b: [string, string][]) {
  if (a.length !== b.length) {
    return false
  }

  const expected = new Set(b.map(([name, value]) => `${name}=${value}`))
  return a.every(([name, value]) => expected.has(`${name}=${value}`))
}

function splitUnescaped(input: string, separator: string) {
  const parts: string[] = []
  let current = ''
  let escaped = false

  for (const char of input) {
    if (escaped) {
      current += char
      escaped = false
    } else if (char === '\\') {
      current += char
      escaped = true
    } else if (char === separator) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }

  parts.push(current)
  return parts
}

function findUnescaped(input: string, target: string) {
  let escaped = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (escaped) {
      escaped = false
    } else if (char === '\\') {
      escaped = true
    } else if (char === target) {
      return index
    }
  }

  return -1
}

function escapeDNValue(value: string) {
  return value.replace(/[\\,+"<>;=#]/g, char => `\\${char}`).replace(/^ /, '\\ ').replace(/ $/, '\\ ')
}

function unescapeDNValue(value: string) {
  return value.replace(/\\([0-9a-fA-F]{2}|.)/g, (_match, escaped: string) => {
    if (/^[0-9a-fA-F]{2}$/.test(escaped)) {
      return String.fromCharCode(Number.parseInt(escaped, 16))
    }

    return escaped
  })
}
