import { registerUserValidator } from '@shared/api-request/RegisterUser'
import { ADMIN_USER, USERNAME_REGEX } from '@shared/constants'
import { TABLES } from '@shared/db'
import type { Group, UserGroup } from '@shared/db/Group'
import type { User } from '@shared/db/User'
import { nameValidation } from '@shared/validators'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import zod from 'zod'
import { db } from '../db/db'
import { parseLegacyHash } from '../util/legacyHash'

const BATCH_SIZE = 200

const importUserValidator = zod.strictObject({
  username: registerUserValidator.username,
  email: registerUserValidator.email,
  name: nameValidation,
  passwordHash: zod.string().refine(hash => !!parseLegacyHash(hash)).nullable(),
  emailVerified: zod.boolean().default(false),
  mfaRequired: zod.boolean().default(false),
}).refine(user => !user.emailVerified || !!user.email, { path: ['emailVerified'] })

// Problems name the entry and field only: any value in the file, or an unknown key, might be a misplaced hash
function entryLabel(index: number, entry: unknown) {
  const username = (entry as { username?: unknown } | null)?.username
  return typeof username === 'string' && USERNAME_REGEX.test(username) ? `Entry ${String(index)} (${username})` : `Entry ${String(index)}`
}

function describeIssue(issue: zod.core.$ZodIssue) {
  return issue.code === 'unrecognized_keys'
    ? `${String(issue.keys.length)} unknown field(s)`
    : `${issue.path.join('.') || 'entry'} is invalid (${issue.code})`
}

/**
 * Import users with their existing password hashes. All or nothing, and an existing user is never overwritten.
 * @returns every problem found, which means nothing was written
 */
export async function importUsers(file: string) {
  let entries: unknown
  try {
    entries = JSON.parse(await readFile(file, 'utf8'))
  } catch (_e) {
    // Fixed message only, a JSON.parse error quotes the input
    return { imported: 0, withoutPassword: 0, problems: ['Could not read the file as JSON.'] }
  }
  if (!Array.isArray(entries)) {
    return { imported: 0, withoutPassword: 0, problems: ['The file must contain a JSON array.'] }
  }

  try {
    const existing = await db().select('username', 'email').table<User>(TABLES.USER)

    // Compared here and not with SQL lower(), which on SQLite only handles ASCII.
    // The initial admin is created on first start and would collide with an imported user.
    const taken = new Set<string>([ADMIN_USER.toLowerCase()])
    for (const user of existing) {
      taken.add(user.username.toLowerCase())
      if (user.email) {
        taken.add(user.email.toLowerCase())
      }
    }

    const problems: string[] = []
    const users: User[] = []
    for (const [index, entry] of (entries as unknown[]).entries()) {
      const label = entryLabel(index, entry)
      const parsed = importUserValidator.safeParse(entry)
      if (!parsed.success) {
        problems.push(...parsed.error.issues.map(issue => `${label}: ${describeIssue(issue)}.`))
        continue
      }

      const { username, email, name, passwordHash, emailVerified, mfaRequired } = parsed.data
      if (taken.has(username.toLowerCase())) {
        problems.push(`${label}: username is reserved or already taken.`)
      }
      if (email && taken.has(email.toLowerCase())) {
        problems.push(`${label}: email is already taken.`)
      }
      taken.add(username.toLowerCase())
      if (email) {
        taken.add(email.toLowerCase())
      }

      users.push({
        id: randomUUID(),
        username,
        email: email ?? null,
        name: name ?? null,
        passwordHash,
        emailVerified,
        mfaRequired,
        approved: true,
        skipPasskeyPrompt: false,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    if (problems.length) {
      return { imported: 0, withoutPassword: 0, problems }
    }

    // Same default groups as a user who registers without an invitation
    const defaultGroups = await db().select().table<Group>(TABLES.GROUP).where({ autoAssign: true })
    const userGroups: UserGroup[] = users.flatMap(user => defaultGroups.map(group => ({
      groupId: group.id,
      userId: user.id,
      createdBy: group.createdBy,
      updatedBy: group.updatedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    })))

    await db().transaction(async (t) => {
      await t.batchInsert(TABLES.USER, users, BATCH_SIZE)
      await t.batchInsert(TABLES.USER_GROUP, userGroups, BATCH_SIZE)
    })

    return { imported: users.length, withoutPassword: users.filter(user => !user.passwordHash).length, problems }
  } catch (_e) {
    // Fixed message only and no cause attached, a knex error on SQLite contains the whole row
    // eslint-disable-next-line preserve-caught-error
    throw new Error('Could not write the users to the database, nothing was imported.')
  }
}
