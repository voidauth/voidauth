import type { Account, AccountClaims, KoaContextWithOIDC } from 'oidc-provider'
import { db } from './db'
import type { UserGroup, Group } from '@shared/db/Group'
import type { UserDetails, UserWithAdminIndicator } from '@shared/api-response/UserDetails'
import type { User } from '@shared/db/User'
import { ADMIN_USER, ADMIN_GROUP, TABLES } from '@shared/constants'
import { randomUUID } from 'crypto'
import { generate } from 'generate-password'
import { als } from '../util/als'
import * as argon2 from 'argon2'
import type { Flag } from '@shared/db/Flag'
import appConfig from '../util/config'
import type { OIDCPayload } from '@shared/db/OIDCPayload'

export async function getUsers(searchTerm?: string): Promise<UserWithAdminIndicator[]> {
  return (await db().table<User>(TABLES.USER).select<(User & { isAdmin: number })[]>('user.*', db().raw(`
      CASE 
        WHEN EXISTS (
          SELECT 1 
          FROM "user_group" ug 
          JOIN "group" g ON ug."groupId" = g."id"
          WHERE ug."userId" = "user"."id" AND g.name = ?
        ) 
        THEN 1 
        ELSE 0 
      END as "isAdmin"
    `, [ADMIN_GROUP])).where((w) => {
    if (searchTerm) {
      w.whereRaw('lower("username") like lower(?)', [`%${searchTerm}%`])
      w.orWhereRaw('lower("email") like lower(?)', [`%${searchTerm}%`])
    }
  }).orderBy('createdAt', 'desc')).map((user) => {
    const { passwordHash, isAdmin, ...u } = user
    return {
      ...u,
      isAdmin: !!isAdmin,
      hasPassword: !!passwordHash,
    }
  })
}

export async function getUserById(id: string): Promise<UserDetails | undefined> {
  const user = await db().table<User>(TABLES.USER).select().where({ id }).first()

  if (!user) {
    return undefined
  }

  const groups = (await db().select('name')
    .table<Group>(TABLES.GROUP)
    .innerJoin<UserGroup>(TABLES.USER_GROUP, 'user_group.groupId', 'group.id').where({ userId: user.id })
    .orderBy('name', 'asc')).map(g => g.name)

  const { passwordHash, ...userWithoutPassword } = user
  return { ...userWithoutPassword, groups, hasPassword: !!passwordHash }
}

export async function getUserByInput(input: string): Promise<UserDetails | undefined> {
  const user = await db().table<User>(TABLES.USER).select()
    .whereRaw('lower("username") = lower(?) or lower("email") = lower(?)', [input, input]).first()

  if (!user) {
    return undefined
  }

  const groups = (await db().select('name')
    .table<Group>(TABLES.GROUP)
    .innerJoin<UserGroup>(TABLES.USER_GROUP, 'user_group.groupId', 'group.id').where({ userId: user.id })
    .orderBy('name', 'asc')).map(g => g.name)

  const { passwordHash, ...userWithoutPassword } = user
  return { ...userWithoutPassword, groups, hasPassword: !!passwordHash }
}

export async function checkPasswordHash(userId: string, password: string): Promise<boolean> {
  const user = await db().select().table<User>(TABLES.USER).where({ id: userId }).first()
  return !!user && !!password && !!user.passwordHash && await argon2.verify(user.passwordHash, password)
}

export function isAdmin(user: Pick<UserDetails, 'groups'>) {
  return user.groups.includes(ADMIN_GROUP)
}

export function isUnapproved(user: Pick<UserDetails, 'approved' | 'groups'>) {
  return !isAdmin(user) && appConfig.SIGNUP_REQUIRES_APPROVAL && !user.approved
}

export function isUnverified(user: Pick<UserDetails, 'email' | 'emailVerified' | 'groups'>) {
  return !isAdmin(user) && appConfig.EMAIL_VERIFICATION && (!user.email || !user.emailVerified)
}

export async function endSessions(userId: string) {
  await db().table<OIDCPayload>(TABLES.OIDC_PAYLOADS).delete().where({ type: 'Session', accountId: userId })
}

export async function findAccount(_: KoaContextWithOIDC | null, id: string): Promise<Account | undefined> {
  const user = await getUserById(id)
  if (!user) {
    return undefined
  }

  return {
    accountId: id,
    claims(_use, scope, _claims, _rejected) {
      const accountClaims: AccountClaims & Partial<UserDetails> = { sub: id }

      if (scope.includes('email')) {
        accountClaims.email = user.email
        accountClaims.email_verified = user.emailVerified
      }

      if (scope.includes('profile')) {
        accountClaims.preferred_username = user.username
        accountClaims.name = user.name
      }

      if (scope.includes('groups')) {
        accountClaims.groups = user.groups
      }

      return accountClaims
    },
  }
}

// Create initial admin user and group
await als.run({}, async () => {
  // Check if admin user and group have ever been created.
  const adminCreated = await db().table<Flag>(TABLES.FLAG).select().where({ name: 'ADMIN_CREATED' }).first()
  if (adminCreated?.value?.toLowerCase() !== 'true') {
    const password = generate({
      length: 32,
      numbers: true,
    })

    const initialAdminUser: User = {
      id: randomUUID(),
      username: ADMIN_USER,
      name: 'Auth Admin',
      passwordHash: await argon2.hash(password),
      emailVerified: true,
      approved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const initialAdminGroup: Group = {
      id: randomUUID(),
      name: ADMIN_GROUP,
      createdBy: initialAdminUser.id,
      updatedBy: initialAdminUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await db().table<User>(TABLES.USER).insert(initialAdminUser)

    await db().table<Group>(TABLES.GROUP).insert(initialAdminGroup)

    await db().table<UserGroup>(TABLES.USER_GROUP).insert({
      userId: initialAdminUser.id,
      groupId: initialAdminGroup.id,
      createdBy: initialAdminUser.id,
      updatedBy: initialAdminUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await db().table<Flag>(TABLES.FLAG).insert({ name: 'ADMIN_CREATED', value: 'true', createdAt: new Date() })
      .onConflict(['name']).merge(['value'])

    console.log('')
    console.log('')
    console.log('The following is the initial Admin username and password, use to create your own user.')
    console.log('These will not be shown again.')
    console.log('')
    console.log(initialAdminUser.username)
    console.log(password)
    console.log('')
  }
})
