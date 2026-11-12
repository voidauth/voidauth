import type { Group, UserGroup } from '@shared/db/Group'
import type { User } from '@shared/db/User'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { openSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { setupTestDb } from '../util/testDb'

const PASSWORD = 'correct horse battery staple'
const DJANGO = 'pbkdf2_sha256$1000000$zJ7e2XE2M2P0FhVAs3tQSb$17l0/VWbhlQgRO3CseqlMwRIk8TtatDkbA1g0Galp70='
const PASSLIB = '$pbkdf2-sha256$29000$EqKU8r7Xei/lfC9FyNk7hw$eRKrQJgclKKtyylC8J4Ox34R097ZpMoU/QC0heA5y.w'
const FAST = '$pbkdf2-sha256$10000$h1AKIURIiVFqzZnTmvN.Dw$zdXZuqHurqISL4zzfy/NY.28a/XIPnCz1I/1hrFeOXE'
const SECRETS = [DJANGO, PASSLIB, FAST, 'zJ7e2XE2M2P0FhVAs3tQSb', '17l0/VWbhlQgRO3CseqlMwRIk8TtatDkbA1g0Galp70', 'pbkdf2_sha', 'pbkdf2-sha']

let testDb: Awaited<ReturnType<typeof setupTestDb>>
// Imported after setupTestDb, as importing db connects to the database
let db: typeof import('../db/db').db
let userModule: typeof import('../db/user')
let importUsers: typeof import('./importUsers').importUsers
let TABLES: typeof import('@shared/db').TABLES

before(async () => {
  testDb = await setupTestDb()
  ;({ db } = await import('../db/db'))
  userModule = await import('../db/user')
  ;({ importUsers } = await import('./importUsers'))
  ;({ TABLES } = await import('@shared/db'))
})

after(async () => {
  await testDb.cleanup()
})

beforeEach(async () => {
  await db().table(TABLES.USER).delete()
  await db().table(TABLES.GROUP).delete()
})

function entry(username: string, fields: Record<string, unknown> = {}) {
  return { username, passwordHash: FAST, ...fields }
}

function writeFile(content: unknown) {
  const file = path.join(testDb.dir, `${randomUUID()}.json`)
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content))
  return file
}

async function importEntries(content: unknown) {
  return await importUsers(writeFile(content))
}

async function allUsers() {
  return await db().select().table<User>(TABLES.USER).orderBy('username')
}

async function insertExisting(username: string, email: string | null) {
  await db().table<User>(TABLES.USER).insert({
    id: randomUUID(),
    username,
    email,
    passwordHash: 'original',
    emailVerified: false,
    approved: true,
    mfaRequired: false,
    skipPasskeyPrompt: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

async function assertRefused(content: unknown) {
  const before = await allUsers()
  const { imported, problems } = await importEntries(content)
  assert.equal(imported, 0)
  assert.ok(problems.length > 0)
  assert.deepEqual(await allUsers(), before)
  return problems
}

function runCli(args: string[], stdinFile?: string) {
  const result = spawnSync(process.execPath, [
    '--import', import.meta.resolve('tsx'), path.join(testDb.repoRoot, 'server/index.ts'), 'user', 'import', ...args,
  ], {
    cwd: testDb.dir,
    env: { ...process.env, TSX_TSCONFIG_PATH: path.join(testDb.repoRoot, 'tsconfig.json') },
    encoding: 'utf8',
    stdio: [stdinFile ? openSync(stdinFile, 'r') : 'ignore', 'pipe', 'pipe'],
  })
  const output = result.stdout + result.stderr
  for (const secret of SECRETS) {
    assert.ok(!output.includes(secret), `output contains ${secret}`)
  }
  return { status: result.status, output }
}

void test('a valid file creates users with both formats, who then log in and upgrade', async () => {
  const result = await importEntries([
    { username: 'django_user', passwordHash: DJANGO },
    { username: 'passlib_user', passwordHash: PASSLIB },
  ])
  assert.deepEqual(result, { imported: 2, withoutPassword: 0, problems: [] })

  for (const row of await allUsers()) {
    assert.equal(await userModule.checkPasswordHash(row.id, `${PASSWORD}x`), false)
    assert.equal(await userModule.checkPasswordHash(row.id, PASSWORD), true)
  }
  for (const row of await allUsers()) {
    assert.match(row.passwordHash ?? '', /^\$argon2id\$/)
  }
})

void test('all generated columns are set and the row is readable', async () => {
  await importEntries([entry('full_user', { email: 'full@example.com', name: 'Full User', emailVerified: true, mfaRequired: true })])
  const [row] = await allUsers()
  assert.ok(row)
  assert.match(row.id, /^[0-9a-f-]{36}$/)
  assert.equal(row.email, 'full@example.com')
  assert.equal(row.name, 'Full User')
  assert.equal(row.passwordHash, FAST)
  assert.equal(!!row.emailVerified, true)
  assert.equal(!!row.mfaRequired, true)
  assert.equal(!!row.approved, true)
  assert.equal(!!row.skipPasskeyPrompt, false)
  assert.equal(row.expiresAt, null)
  assert.equal(row.avatarHash, null)
  assert.ok(row.createdAt)
  assert.ok(row.updatedAt)

  const details = await userModule.getUserById(row.id)
  assert.equal(details?.username, 'full_user')
  assert.equal(details.hasPassword, true)

  await importEntries([entry('default_user')])
  const defaults = (await allUsers()).find(u => u.username === 'default_user')
  assert.equal(defaults?.email, null)
  assert.equal(defaults.name, null)
  assert.equal(!!defaults.emailVerified, false)
  assert.equal(!!defaults.mfaRequired, false)
})

void test('autoAssign groups are attached, other groups are not', async () => {
  const createdBy = randomUUID()
  const auto: Group = {
    id: randomUUID(), name: 'auto', mfaRequired: false, autoAssign: true,
    createdBy, updatedBy: createdBy, createdAt: new Date(), updatedAt: new Date(),
  }
  await db().table<Group>(TABLES.GROUP).insert([auto, { ...auto, id: randomUUID(), name: 'manual', autoAssign: false }])

  await importEntries([entry('grouped_user')])
  const [row] = await allUsers()
  const memberships = await db().select().table<UserGroup>(TABLES.USER_GROUP).where({ userId: row?.id ?? '' })
  assert.deepEqual(memberships.map(m => m.groupId), [auto.id])
  assert.equal(memberships[0]?.createdBy, createdBy)
})

void test('any invalid entry writes nothing and every problem is reported', async () => {
  const problems = await assertRefused([
    entry('good_user'),
    entry('bad.username'),
    entry('bad_hash', { passwordHash: 'md5$a$b' }),
    entry('good_user'),
    42,
  ])
  assert.equal(problems.length, 4)
  assert.match(problems[0] ?? '', /^Entry 1: username/)
  assert.match(problems[1] ?? '', /^Entry 2 \(bad_hash\): passwordHash/)
  assert.match(problems[2] ?? '', /^Entry 3 \(good_user\): username/)
  assert.match(problems[3] ?? '', /^Entry 4: entry/)
})

void test('conflicts are refused and the existing row is unchanged', async () => {
  await insertExisting('existing_user', 'taken@example.com')
  await insertExisting('unicode_user', 'ändi@example.com')

  await assertRefused([entry('EXISTING_USER')])
  await assertRefused([entry('new_user', { email: 'TAKEN@example.com' })])
  // Fails with a plain SQL lower() on SQLite, which only handles ASCII
  await assertRefused([entry('new_user', { email: 'ÄNDI@example.com' })])
  await assertRefused([entry('dup_user'), entry('DUP_USER')])
  await assertRefused([entry('user_one', { email: 'dup@example.com' }), entry('user_two', { email: 'DUP@example.com' })])
})

void test('the initial admin username is refused in any case, on an empty database too', async () => {
  assert.equal((await allUsers()).length, 0)
  await assertRefused([entry('auth_admin')])
  await assertRefused([entry('AUTH_ADMIN')])
  await assertRefused([entry('Auth_Admin')])
})

void test('invalid fields are refused', async () => {
  await assertRefused([entry('user_a', { unknownKey: 1 })])
  await assertRefused([entry('user_a', { mfaRequied: true })])
  await assertRefused([entry('user_a', { approved: false })])
  await assertRefused([entry('user_a', { passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2g' })])
  await assertRefused([entry('user_a', { passwordHash: '!x' })])
  await assertRefused([entry('user_a', { passwordHash: '' })])
  await assertRefused([{ username: 'user_a' }])
  await assertRefused([entry('user_a', { name: 'x'.repeat(65) })])
  await assertRefused([entry('user_a', { email: 'not an email' })])
  await assertRefused({ username: 'not_an_array', passwordHash: FAST })
})

void test('emailVerified without an email is refused', async () => {
  await assertRefused([entry('user_a', { emailVerified: true })])
  await assertRefused([entry('user_a', { emailVerified: true, email: null })])
  await assertRefused([entry('user_a', { emailVerified: true, email: '' })])
})

void test('a null hash creates a user without a password, who can then be reset', async () => {
  const { createPasswordReset, getPasswordResetURL } = await import('../db/passwordReset')
  const { argon2 } = await import('../util/argon2id')
  const result = await importEntries([entry('reset_user', { passwordHash: null })])
  assert.deepEqual(result, { imported: 1, withoutPassword: 1, problems: [] })

  const [row] = await allUsers()
  assert.ok(row)
  assert.equal((await userModule.getUserById(row.id))?.hasPassword, false)
  assert.equal(await userModule.checkPasswordHash(row.id, PASSWORD), false)

  const reset = await createPasswordReset(row.id)
  assert.match(getPasswordResetURL(reset), /\/reset_password\?id=/)
  // What POST /public/reset_password in server/routes/public.ts writes
  await db().table<User>(TABLES.USER).update({ passwordHash: argon2.hash(PASSWORD) }).where({ id: row.id })
  assert.equal(await userModule.checkPasswordHash(row.id, PASSWORD), true)
})

void test('20,000 entries import within the batch limits, and a failure at the end leaves no rows', async () => {
  const entries = Array.from({ length: 20000 }, (_, i) => entry(`bulk_${String(i)}`, { name: `Bulk ${String(i)}` }))
  const createdBy = randomUUID()
  await db().table<Group>(TABLES.GROUP).insert({
    id: randomUUID(), name: 'auto', mfaRequired: false, autoAssign: true,
    createdBy, updatedBy: createdBy, createdAt: new Date(), updatedAt: new Date(),
  })

  await db().raw('CREATE UNIQUE INDEX forced_name ON "user" ("name")')
  const failing = entries.concat(entry('bulk_last', { name: 'Bulk 0' }))
  await assert.rejects(importEntries(failing), { message: 'Could not write the users to the database, nothing was imported.' })
  assert.equal((await allUsers()).length, 0)
  await db().raw('DROP INDEX forced_name')

  assert.equal((await importEntries(entries)).imported, 20000)
  assert.equal((await allUsers()).length, 20000)
  assert.equal((await db().select().table<UserGroup>(TABLES.USER_GROUP)).length, 20000)
})

void test('command: success prints a summary, no secrets, exit 0', () => {
  const { status, output } = runCli([writeFile([entry('cli_user', { passwordHash: DJANGO })])])
  assert.equal(status, 0)
  assert.match(output, /Imported 1 user\(s\), 0 without a password/)
})

void test('command: reads /dev/stdin', () => {
  const { status } = runCli(['/dev/stdin'], writeFile([entry('stdin_user', { passwordHash: PASSLIB })]))
  assert.equal(status, 0)
})

void test('command: bad JSON containing a hash prints a fixed message, exit 1', () => {
  const { status, output } = runCli([writeFile(`[${DJANGO}]`)])
  assert.equal(status, 1)
  assert.match(output, /Could not read the file as JSON\./)
})

void test('command: a hash as an unknown key is not printed, exit 1', () => {
  const { status, output } = runCli([writeFile([{ ...entry('key_user'), [DJANGO]: PASSLIB }])])
  assert.equal(status, 1)
  assert.match(output, /Entry 0 \(key_user\): 1 unknown field\(s\)/)
})

void test('command: a hash as the username is not printed, exit 1', () => {
  const { status, output } = runCli([writeFile([entry(DJANGO)])])
  assert.equal(status, 1)
  assert.match(output, /Entry 0: username is invalid/)
})

void test('command: a unique violation after validation prints a fixed message, exit 1', async () => {
  await db().raw('CREATE UNIQUE INDEX forced_name ON "user" ("name")')
  try {
    const { status, output } = runCli([writeFile([
      entry('one_user', { name: 'Same', passwordHash: DJANGO }),
      entry('two_user', { name: 'Same', passwordHash: PASSLIB }),
    ])])
    assert.equal(status, 1)
    assert.match(output, /Could not write the users to the database/)
    assert.equal((await allUsers()).length, 0)
  } finally {
    await db().raw('DROP INDEX forced_name')
  }
})

void test('command: no file argument exits 2', () => {
  assert.equal(runCli([]).status, 2)
})

void test('command: a missing file exits 1', () => {
  assert.equal(runCli(['/nonexistent.json']).status, 1)
})
