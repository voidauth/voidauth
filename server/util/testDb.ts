import knex from 'knex'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * Point the app at a throwaway database in a temporary directory, so tests never touch a developer's database.
 * Must run before anything imports server/db/db, as importing it connects and migrates.
 */
export async function setupTestDb() {
  const repoRoot = process.cwd()
  const dir = mkdtempSync(path.join(tmpdir(), 'voidauth-test-'))
  symlinkSync(path.join(repoRoot, 'migrations'), path.join(dir, 'migrations'))

  process.env.APP_URL = 'http://localhost:3000'
  process.env.STORAGE_KEY = 'test-storage-key-that-is-long-enough'
  process.env.DB_ADAPTER ??= 'sqlite'

  const dbName = `voidauth_test_${randomBytes(8).toString('hex')}`
  const postgresAdmin = async (sql: string) => {
    const admin = knex({
      client: 'pg',
      connection: {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT ?? 5432),
        user: process.env.DB_USER ?? 'postgres',
        password: process.env.DB_PASSWORD,
        database: 'postgres',
      },
    })
    await admin.raw(sql, [dbName])
    await admin.destroy()
  }
  if (process.env.DB_ADAPTER === 'postgres') {
    // A database per test file, as node:test runs test files in parallel
    await postgresAdmin('CREATE DATABASE ??')
    process.env.DB_NAME = dbName
  }

  process.chdir(dir)
  const { db } = await import('../db/db')

  return {
    dir,
    repoRoot,
    dbName,
    cleanup: async () => {
      await db().destroy()
      process.chdir(repoRoot)
      if (process.env.DB_ADAPTER === 'postgres') {
        await postgresAdmin('DROP DATABASE ??')
      }
      rmSync(dir, { recursive: true })
    },
  }
}
