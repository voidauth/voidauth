import { db } from '../db/db'
import type { User } from '@shared/db/User'
import type { Group, UserGroup } from '@shared/db/Group'
import { TABLES } from '@shared/db'
import appConfig from '../util/config'
import type { Nullable } from '@shared/utils'
import { getLDAPVisibleUsers } from '../db/user'
import { parseDN } from './util'

export const MAX_SEARCH_RESULTS = 1000

export type LDAPAttributes = {
  [x: string]: string | string[]
}

export type LDAPEntry = {
  dn: string
  attributes: LDAPAttributes
}

export type LDAPSearchScope = 'base' | 'one' | 'sub' | 0 | 1 | 2

type UserLDAPAttributes = Pick<User, 'id' | 'username' | 'name' | 'email'>

export function usersBaseDN() {
  return `${rdn('ou', 'people')},${appConfig.LDAP_BASE_DN}`
}

export function groupsBaseDN() {
  return `${rdn('ou', 'groups')},${appConfig.LDAP_BASE_DN}`
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

export async function getLDAPEntries() {
  const [users, groups] = await Promise.all([
    getLDAPVisibleUsers(MAX_SEARCH_RESULTS),
    db().table<Group>(TABLES.GROUP).select('id', 'name').limit(MAX_SEARCH_RESULTS),
  ])

  // There won't be any memberships if there are no users or groups
  const memberships = users.length && groups.length
    ? await db().table<UserGroup>(TABLES.USER_GROUP)
        .select('userId', 'groupId')
        .where('userId', 'in', users.map(u => u.id))
        .andWhere('groupId', 'in', groups.map(g => g.id))
        .limit(MAX_SEARCH_RESULTS)
    : []
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

  const usersById = new Map(users.map(user => [user.id, user]))

  const entries: LDAPEntry[] = [
    rootDSEEntry(),
    baseEntry(),
    organizationalUnitEntry('people', usersBaseDN()),
    organizationalUnitEntry('groups', groupsBaseDN()),
  ]

  for (const user of users) {
    entries.push(userEntry(user, groupNamesByUserId.get(user.id) ?? []))
  }

  for (const group of groups) {
    const groupUsers = (userIdsByGroupId.get(group.id) ?? [])
      .map(userId => usersById.get(userId))
      .filter((user): user is UserLDAPAttributes => !!user)

    entries.push(groupEntry(group, groupUsers))
  }

  return entries
}

export async function getLDAPEntryByDN(dn: string) {
  return (await getLDAPEntries()).find(entry => dnEqual(entry.dn, dn))
}

export async function getLDAPUserByDN(dn: string) {
  // remove the user base DN suffix and parse the uid from the remaining DN
  const userBaseDN = usersBaseDN()
  if (dn.toLowerCase().endsWith(userBaseDN.toLowerCase())) {
    dn = dn.slice(0, -userBaseDN.length - 1)
  } else {
    return undefined
  }
  // parse out the uid from the input dn
  const parsed = parseDN(dn)
  if (!parsed || parsed.length !== 1 || parsed[0]?.length !== 1 || parsed[0][0]?.[0] !== 'uid') {
    return undefined
  }
  const uid = parsed[0][0][1]
  if (!uid) {
    return undefined
  }
  const users = await db().table<User>(TABLES.USER).select().where({ username: uid })
  if (!users.length || users.length > 1) {
    return undefined
  }
  return users[0]
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

function rootDSEEntry() {
  return {
    dn: '',
    attributes: truthyAttributes({
      objectClass: ['top'],
      namingContexts: [appConfig.LDAP_BASE_DN],
      supportedLDAPVersion: ['3'],
      supportedFeatures: ['1.3.6.1.4.1.4203.1.5.1'],
      vendorName: appConfig.APP_TITLE,
    }),
  }
}

function baseEntry() {
  return {
    dn: appConfig.LDAP_BASE_DN,
    attributes: truthyAttributes({
      objectClass: ['top', 'dcObject', 'organization'],
      dc: firstDcValue(appConfig.LDAP_BASE_DN),
      o: appConfig.APP_TITLE,
    }),
  }
}

function organizationalUnitEntry(ou: string, dn: string) {
  return {
    dn,
    attributes: truthyAttributes({
      objectClass: ['top', 'organizationalUnit'],
      ou,
    }),
  }
}

function userEntry(
  user: UserLDAPAttributes,
  groupNames: string[]) {
  const cn = user.name || user.username
  const groupDNs = groupNames.map(name => ldapGroupDN({ name })).sort((a, b) => a.localeCompare(b))

  return {
    dn: ldapUserDN(user),
    attributes: truthyAttributes({
      objectClass: ['top', 'person', 'organizationalPerson', 'inetOrgPerson'],
      entryUUID: user.id,
      uid: user.username,
      cn,
      displayName: cn,
      mail: user.email,
      memberOf: groupDNs,
      isMemberOf: groupDNs,
    }),
  }
}

function groupEntry(group: Pick<Group, 'id' | 'name'>, users: UserLDAPAttributes[]) {
  const members = users.map(user => ldapUserDN(user)).sort((a, b) => a.localeCompare(b))

  return {
    dn: ldapGroupDN(group),
    attributes: truthyAttributes({
      objectClass: ['top', 'groupOfNames', 'groupOfUniqueNames'],
      entryUUID: group.id,
      cn: group.name,
      member: members,
      uniqueMember: members,
      memberUid: users.map(user => user.username).sort((a, b) => a.localeCompare(b)),
    }),
  }
}

function truthyAttributes(input: Partial<Nullable<LDAPAttributes>>) {
  const output: LDAPAttributes = {}

  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value) && value.length) {
      output[key] = value
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

function normalizeDN(dn: string) {
  const parsed = parseDN(dn)
  return parsed
    ? parsed.map(rdn => rdn.map((v) => {
        const [name, value] = v
        return `${name}=${value}`
      }).join('+')).join(',')
    : dn.trim().toLowerCase()
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

function escapeDNValue(value: string) {
  return value.replace(/[\\,+"<>;=#]/g, char => `\\${char}`).replace(/^ /, '\\ ').replace(/ $/, '\\ ')
}
