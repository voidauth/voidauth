import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { setupTestDb } from './testDb'

let testDb: Awaited<ReturnType<typeof setupTestDb>>

before(async () => {
  testDb = await setupTestDb()
})

after(async () => {
  await testDb.cleanup()
})

void test('database is isolated from the repo', async () => {
  const { db } = await import('../db/db')
  if (process.env.DB_ADAPTER === 'postgres') {
    const result = await db().raw<{ rows: { name: string }[] }>('select current_database() as name')
    assert.equal(result.rows[0]?.name, testDb.dbName)
  } else {
    assert.ok(existsSync(path.join(testDb.dir, 'db', 'db.sqlite')))
    assert.equal(process.cwd(), testDb.dir)
  }
})
