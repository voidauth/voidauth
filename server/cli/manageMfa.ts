import { TABLES } from '@shared/db'
import { getUserByInput } from '../db/user'
import type { User } from '@shared/db/User'
import { db } from '../db/db'
import type { TOTP } from '@shared/db/TOTP'

export async function manageMfa(input: string, enable: boolean) {
  input = input.trim()

  const user = await getUserByInput(input)

  if (!user) {
    throw new Error('User with username not found.')
  }

  await db().table<TOTP>(TABLES.TOTP).delete().where({ userId: user.id })
  await db().table<User>(TABLES.USER).update({ mfaRequired: enable }).where({ id: user.id })
}
