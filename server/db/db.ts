import knex from 'knex'
import path from 'path'
import appConfig from '../util/config'
import fs from 'node:fs'
import { getAsyncStore } from '../util/als'

const SQLITE_DIR = appConfig.SQLITE_DIR

if (!fs.existsSync(SQLITE_DIR)) {
  fs.mkdirSync(SQLITE_DIR, {
    recursive: true,
  })
}

const _db = knex({
  client: 'sqlite3', // or 'better-sqlite3'
  connection: {
    filename: path.join(SQLITE_DIR, 'db.sqlite'),
    // host: '127.0.0.1',
    // port: 3306,
    // user: 'your_database_user',
    // password: 'your_database_password',
    // database: 'myapp_test',
  },
  pool: {
    // eslint-disable-next-line @stylistic/max-len
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    afterCreate: (conn: any, done: any) => conn.run('PRAGMA foreign_keys = ON', done),
  },
  useNullAsDefault: true,
})
/**
 * @type {[count: number, ran: string[]]}
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const [,migrations]: [number, string[]] = await _db.migrate.latest({
  loadExtensions: ['.ts'],
})

if (migrations.length) {
  console.log(`Ran Migrations: ${migrations.join(', ')}`)
}

export async function createTransaction() {
  const store = getAsyncStore()
  if (!store) {
    throw new Error('Cannot create transaction outside of async context.')
  }
  store.transaction = await _db.transaction()
}

export async function commit() {
  await getAsyncStore()?.transaction?.commit()
  delete getAsyncStore()?.transaction
}

export async function rollback() {
  await getAsyncStore()?.transaction?.rollback()
  delete getAsyncStore()?.transaction
}

export function db() {
  return getAsyncStore()?.transaction ?? _db
}
