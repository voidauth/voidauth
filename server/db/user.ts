import type { Account, AccountClaims, KoaContextWithOIDC } from 'oidc-provider'
import { db } from './db'
import type { UserGroup, Group } from '@shared/db/Group'
import type { UserDetails, UserWithoutPassword } from '@shared/api-response/UserDetails'
import type { User } from '@shared/db/User'

export async function getUsers(): Promise<UserWithoutPassword[]> {
  return (await db().table<User>('user').select()).map((user) => {
    const { passwordHash, ...u } = user
    return u
  })
}

export async function getUserById(id: string): Promise<UserWithoutPassword | undefined> {
  const user = (await db().table<User>('user')
    .select().where({ id }).first())

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
