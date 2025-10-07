import knex from 'knex'
import appConfig from '../util/config'
import { als } from '../util/als'
import { exit } from 'process'
import { connectionPg, connectionSQLite } from './connection'

let connectionOptions: Parameters<typeof knex>[0] | null = null

try {
  if (appConfig.DB_ADAPTER === 'postgres') {
    connectionOptions = connectionPg({
      DB_HOST: appConfig.DB_HOST,
      DB_PORT: appConfig.DB_PORT,
      DB_USER: appConfig.DB_USER,
      DB_NAME: appConfig.DB_NAME,
      DB_PASSWORD: appConfig.DB_PASSWORD,
    })
  } else if (appConfig.DB_ADAPTER === 'sqlite') {
    connectionOptions = connectionSQLite()
  }
} catch (e) {
  console.error(e)
  exit(1)
}

if (!connectionOptions) {
  console.error(`DB_ADAPTER, if set, must be either 'postgres' or 'sqlite'.`)
  exit(1)
}

const _db = knex(connectionOptions)

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const [,migrations]: [number, string[]] = await _db.migrate.latest({
  loadExtensions: ['.ts'],
})

if (migrations.length) {
  console.log(`Ran Migrations: ${migrations.join(', ')}`)
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

// if MIGRATE_TO_DB_ADAPTER is set, attempt to migrate existing DB to a new DB
await als.run({}, async () => {
  // Check if MIGRATE_TO_DB_ADAPTER is set
  if (appConfig.MIGRATE_TO_DB_ADAPTER) {
    await new Promise((resolve, _reject) => {
      resolve(true)
    })
  }
})
