import knex from 'knex'
import appConfig from '../util/config'
import { als } from '../util/als'
import { generate } from 'generate-password'
import { exit } from 'process'
import fs from 'node:fs'

let connectionOptions: Parameters<typeof knex>[0] | null = null

if (appConfig.DB_ADAPTER === 'postgres') {
  // check that DB_PASSWORD is set
  if (!appConfig.DB_PASSWORD?.length) {
    console.error('DB_PASSWORD must be set. If you don\'t already have one, use something long and random like:')
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

  connectionOptions = {
    client: 'pg',
    connection: {
      host: appConfig.DB_HOST,
      port: appConfig.DB_PORT,
      user: appConfig.DB_USER,
      database: appConfig.DB_NAME,
      password: appConfig.DB_PASSWORD,
    },
  }
} else if (appConfig.DB_ADAPTER === 'sqlite') {
  if (!fs.existsSync('./db')) {
    fs.mkdirSync('./db', {
      recursive: true,
    })
  }

  connectionOptions = {
    client: 'sqlite3',
    connection: {
      filename: './db/db.sqlite',
    },
    useNullAsDefault: false,
    pool: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      afterCreate: (conn: any, cb: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        conn.prepare('PRAGMA foreign_keys = ON').run()
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        cb()
      },
    },
  }
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
