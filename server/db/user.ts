import type { Account, AccountClaims, KoaContextWithOIDC } from 'oidc-provider'
import { db } from './db'
import type { UserGroup, Group } from '@shared/db/Group'
import type { UserDetails, UserWithoutPassword } from '@shared/api-response/UserDetails'
import type { User } from '@shared/db/User'
import { ADMIN_USER, ADMIN_GROUP } from '@shared/constants'
import { randomUUID } from 'crypto'
import { generate } from 'generate-password'
import { als } from '../util/als'
import * as argon2 from 'argon2'
import type { Flag } from '@shared/db/Flag'

export async function getUsers(): Promise<UserWithoutPassword[]> {
  return (await db().table<User>('user').select().orderBy('createdAt', 'desc')).map((user) => {
    const { passwordHash, ...u } = user
    return u
  })
}

export async function getUserById(id: string): Promise<UserWithoutPassword | undefined> {
  const user = await db().table<User>('user').select().where({ id }).first()

  if (!user) {
    return undefined
  }

  const { passwordHash, ...userWithoutPassword } = user
  return userWithoutPassword
}

export async function getUserByInput(input: string) {
  return await db().table<User>('user').select()
    .whereRaw('lower("username") = lower(?) or lower("email") = lower(?)', [input, input]).first()
}

export async function findAccount(_: KoaContextWithOIDC | null, id: string): Promise<Account | undefined> {
  const user = await getUserById(id)
  const groups = await db().select('name')
    .table<Group>('group')
    .innerJoin<UserGroup>('user_group', 'user_group.groupId', 'group.id').where({ userId: id })
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
        accountClaims.groups = groups.map(g => g.name)
      }

      return accountClaims
    },
  }
}

// Create initial admin user and group
await als.run({}, async () => {
  // Check if admin user and group have ever been created.
  const adminCreated = await db().table<Flag>('flag').select().where({ name: 'ADMIN_CREATED' }).first()
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

    await db().table<User>('user').insert(initialAdminUser)

    await db().table<Group>('group').insert(initialAdminGroup)

    await db().table<UserGroup>('user_group').insert({
      userId: initialAdminUser.id,
      groupId: initialAdminGroup.id,
      createdBy: initialAdminUser.id,
      updatedBy: initialAdminUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await db().table<Flag>('flag').insert({ name: 'ADMIN_CREATED', value: 'true', createdAt: new Date() })
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
