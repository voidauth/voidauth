import knex from 'knex'
import appConfig from '../util/config'
import { als } from '../util/als'
import { exit } from 'process'
import { getConnectionOptions } from './connection'

let connectionOptions: knex.Knex.Config

try {
  connectionOptions = getConnectionOptions({
    DB_ADAPTER: appConfig.DB_ADAPTER,
    DB_HOST: appConfig.DB_HOST,
    DB_PORT: appConfig.DB_PORT,
    DB_USER: appConfig.DB_USER,
    DB_NAME: appConfig.DB_NAME,
    DB_PASSWORD: appConfig.DB_PASSWORD,
  })
} catch (e) {
  console.error(typeof e === 'object' && e != null && 'message' in e ? e.message : e)
  exit(1)
}

const _db = knex(connectionOptions)

const migrations = await runMigrations(_db)
if (migrations.length) {
  console.log('Database schema updated.')
}

export async function runMigrations(db: knex.Knex) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const [,migrations]: [number, string[]] = await db.migrate.latest({
    loadExtensions: ['.ts'],
  })
  return migrations
}

export async function transaction() {
  const store = als.getStore()
  if (!store) {
    throw new Error('Cannot create transaction outside of async context.')
  }
  if (!store.transaction) {
    store.transaction = await _db.transaction()
  }
}

export async function commit() {
  await als.getStore()?.transaction?.commit()
  delete als.getStore()?.transaction
}

export async function rollback() {
  await als.getStore()?.transaction?.rollback()
  delete als.getStore()?.transaction
}

export function db() {
  return als.getStore()?.transaction ?? _db
}
