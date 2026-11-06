import type { User } from '@shared/db/User'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { setupTestDb } from '../util/testDb'

const PASSWORD = 'correct horse battery staple'
const DJANGO = 'pbkdf2_sha256$1000000$zJ7e2XE2M2P0FhVAs3tQSb$17l0/VWbhlQgRO3CseqlMwRIk8TtatDkbA1g0Galp70='
const PASSLIB = '$pbkdf2-sha256$29000$EqKU8r7Xei/lfC9FyNk7hw$eRKrQJgclKKtyylC8J4Ox34R097ZpMoU/QC0heA5y.w'

let testDb: Awaited<ReturnType<typeof setupTestDb>>
// Imported after setupTestDb, as importing db connects to the database
let dbModule: typeof import('./db')
let checkPasswordHash: typeof import('./user').checkPasswordHash
let argon2: typeof import('../util/argon2id').argon2
let TABLES: typeof import('@shared/db').TABLES

before(async () => {
  testDb = await setupTestDb()
  dbModule = await import('./db')
  ;({ checkPasswordHash } = await import('./user'))
  ;({ argon2 } = await import('../util/argon2id'))
  ;({ TABLES } = await import('@shared/db'))
})

after(async () => {
  await testDb.cleanup()
})

async function insertUser(passwordHash: string | null) {
  const id = randomUUID()
  await dbModule.db().table<User>(TABLES.USER).insert({
    id,
    username: id.replaceAll('-', '_'),
    passwordHash,
    emailVerified: false,
    approved: true,
    mfaRequired: false,
    skipPasskeyPrompt: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

async function storedHash(id: string) {
  const user = await dbModule.db().select().table<User>(TABLES.USER).where({ id }).first()
  return user?.passwordHash
}

// Every update of a user fails from now until the returned function runs
async function failUserUpdates() {
  const db = dbModule.db()
  if (process.env.DB_ADAPTER === 'postgres') {
    await db.raw(`CREATE OR REPLACE FUNCTION fail_update() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced failure'; END $$ LANGUAGE plpgsql`)
    await db.raw('CREATE TRIGGER fail_user_update BEFORE UPDATE ON "user" FOR EACH ROW EXECUTE FUNCTION fail_update()')
    return async () => {
      await db.raw('DROP TRIGGER fail_user_update ON "user"')
    }
  }
  await db.raw(`CREATE TRIGGER fail_user_update BEFORE UPDATE ON "user" BEGIN SELECT RAISE(ABORT, 'forced failure'); END`)
  return async () => {
    await db.raw('DROP TRIGGER fail_user_update')
  }
}

for (const hash of [DJANGO, PASSLIB]) {
  void test(`correct password upgrades ${hash.slice(0, 15)} to argon2id`, async () => {
    const id = await insertUser(hash)
    assert.equal(await checkPasswordHash(id, PASSWORD), true)
    assert.match(await storedHash(id) ?? '', /^\$argon2id\$/)
    assert.equal(await checkPasswordHash(id, PASSWORD), true)
    assert.equal(await checkPasswordHash(id, `${PASSWORD}x`), false)
  })

  void test(`wrong password leaves ${hash.slice(0, 15)} unchanged`, async () => {
    const id = await insertUser(hash)
    assert.equal(await checkPasswordHash(id, `${PASSWORD}x`), false)
    assert.equal(await storedHash(id), hash)
  })
}

void test('argon2 behaviour is unchanged', async () => {
  const hash = argon2.hash(PASSWORD)
  const id = await insertUser(hash)
  assert.equal(await checkPasswordHash(id, PASSWORD), true)
  assert.equal(await checkPasswordHash(id, `${PASSWORD}x`), false)
  assert.equal(await storedHash(id), hash)
})

void test('a hash changed between read and update is not overwritten', async () => {
  const id = await insertUser(DJANGO)
  const newer = argon2.hash('a newer password')

  // Runs after the select of checkPasswordHash, while PBKDF2 is still running
  const selected = new Promise(resolve => dbModule.db().once('query-response', resolve))
  const check = checkPasswordHash(id, PASSWORD)
  await selected
  await dbModule.db().table<User>(TABLES.USER).update({ passwordHash: newer }).where({ id })

  assert.equal(await check, true)
  assert.equal(await storedHash(id), newer)
})

void test('a failed upgrade inside a request transaction still logs in and keeps the transaction usable', async (t) => {
  const { als } = await import('../util/als')
  const { purgeAsyncLog } = await import('../util/logger')
  const id = await insertUser(DJANGO)
  const other = await insertUser(null)
  const output = [t.mock.method(console, 'log', () => undefined), t.mock.method(console, 'error', () => undefined)]
  const restoreUpdates = await failUserUpdates()

  try {
    await als.run({}, async () => {
      await dbModule.transaction()
      try {
        assert.equal(await checkPasswordHash(id, PASSWORD), true)
        assert.equal(await storedHash(id), DJANGO)
        // Would fail with 'current transaction is aborted' without the nested transaction
        await dbModule.db().table<User>(TABLES.USER).delete().where({ id: other })
        await dbModule.commit()
      } finally {
        // An open transaction would block the restore below forever
        await dbModule.rollback()
      }
      purgeAsyncLog()
    })
  } finally {
    await restoreUpdates()
  }

  assert.equal(await storedHash(other), undefined)
  const printed = JSON.stringify(output.flatMap(o => o.mock.calls.map(c => c.arguments)))
  assert.ok(!printed.includes(DJANGO))
  assert.ok(!printed.includes('$argon2id$'))
  assert.ok(!printed.includes('forced failure'))
  assert.ok(printed.includes('Could not upgrade password hash.'))
})

void test('a failed upgrade outside a transaction still logs in and retries next time', async (t) => {
  const id = await insertUser(PASSLIB)
  t.mock.method(console, 'error', () => undefined)
  const restoreUpdates = await failUserUpdates()
  try {
    assert.equal(await checkPasswordHash(id, PASSWORD), true)
    assert.equal(await storedHash(id), PASSLIB)
  } finally {
    await restoreUpdates()
  }

  assert.equal(await checkPasswordHash(id, PASSWORD), true)
  assert.match(await storedHash(id) ?? '', /^\$argon2id\$/)
})

void test('unsupported stored values return false without throwing', async (t) => {
  const output = t.mock.method(console, 'error', () => undefined)
  for (const hash of ['notahash', 'pbkdf2_sha256$10000$abcdefghijkl$uO77', '!unusable']) {
    const id = await insertUser(hash)
    assert.equal(await checkPasswordHash(id, PASSWORD), false)
    assert.equal(await storedHash(id), hash)
  }
  assert.ok(!JSON.stringify(output.mock.calls.map(c => c.arguments)).includes('notahash'))
})

void test('a malformed argon2 hash still throws', async () => {
  const id = await insertUser('$argon2id$broken')
  await assert.rejects(checkPasswordHash(id, PASSWORD))
})

void test('a missing hash, an empty password or an unknown user return false', async () => {
  assert.equal(await checkPasswordHash(await insertUser(null), PASSWORD), false)
  assert.equal(await checkPasswordHash(await insertUser(''), PASSWORD), false)
  assert.equal(await checkPasswordHash(await insertUser(DJANGO), ''), false)
  assert.equal(await checkPasswordHash(randomUUID(), PASSWORD), false)
})

void test('password change on a legacy user leaves only the new password working', async () => {
  const id = await insertUser(DJANGO)
  // The sequence of PATCH /user/password in server/routes/user.ts
  assert.equal(await checkPasswordHash(id, PASSWORD), true)
  await dbModule.db().table<User>(TABLES.USER).update({ passwordHash: argon2.hash('a new password') }).where({ id })

  assert.equal(await checkPasswordHash(id, PASSWORD), false)
  assert.equal(await checkPasswordHash(id, 'a new password'), true)
})
