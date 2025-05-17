import knex from 'knex'
import appConfig from '../util/config'
import { getAsyncStore } from '../util/als'
import { generate } from 'generate-password'
import { exit } from 'process'

// check that DB_PASSWORD is set
if (!appConfig.DB_PASSWORD?.length) {
  console.error(`DB_PASSWORD must be set. If you don't already have one, use something long and random like:`)
  console.error(generate({
    length: 32,
    numbers: true,
  }))
  exit(1)
}

// check that DB_HOST is set
if (!appConfig.DB_HOST?.length) {
  console.error('DB_HOST must be set.')
  exit(1)
}

const _db = knex({
  client: 'pg',
  connection: {
    host: appConfig.DB_HOST,
    port: appConfig.DB_PORT,
    user: appConfig.DB_USER,
    database: appConfig.DB_NAME,
    password: appConfig.DB_PASSWORD,
  },
})

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
