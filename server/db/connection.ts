import { generate } from 'generate-password'
import type { Knex } from 'knex'
import knex from 'knex'
import fs from 'node:fs'
import { logger } from '../util/logger'

export type DBConnectionOptions = {
  DB_ADAPTER: string
  DB_PASSWORD?: string
  DB_HOST?: string
  DB_PORT?: number
  DB_NAME?: string
  DB_USER?: string
  DB_SSL?: boolean
  DB_SSL_VERIFICATION?: boolean
  isMigration?: boolean
}

async function runSchemaUpdates(connectionOptions: Knex.Config) {
  if (connectionOptions.client === 'sqlite3' || connectionOptions.client === 'better-sqlite') {
    const { pool, ...rest } = connectionOptions
    connectionOptions = rest
  }

  const db = knex(connectionOptions)

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const [,migrations]: [number, string[]] = await db.migrate.latest({
    loadExtensions: ['.ts'],
  })
  await db.destroy()
  return migrations
}

export async function createDB(options: DBConnectionOptions) {
  const connOptions = getConnectionOptions(options)
  const migrations = await runSchemaUpdates(connOptions)
  if (migrations.length) {
    logger.info('Database schema updated.')
  }
  return knex(connOptions)
}

function getConnectionOptions(options: DBConnectionOptions): knex.Knex.Config {
  if (options.DB_ADAPTER === 'postgres') {
    return connectionPg(options)
  } else if (options.DB_ADAPTER === 'sqlite') {
    return connectionSQLite()
  } else {
    throw new Error(`${options.isMigration ? 'MIGRATE_TO_' : ''}DB_ADAPTER, if set, must be either 'postgres' or 'sqlite'.`)
  }
}

function connectionPg(options: DBConnectionOptions): Knex.Config {
  // DB_HOST is required (can be a socket path starting with /)
  if (!options.DB_HOST?.length) {
    throw new Error(`${options.isMigration ? 'MIGRATE_TO_' : ''}DB_HOST must be set. To use a Unix socket, set it to the socket directory path (e.g., /var/run/postgresql).`)
  }

  const isSocketPath = options.DB_HOST.startsWith('/')

  const connection: Knex.Config['connection'] = {
    host: options.DB_HOST,
    port: options.DB_PORT ?? 5432,
    user: options.DB_USER ?? 'postgres',
    database: options.DB_NAME ?? 'postgres',
  }

  if (options.DB_PASSWORD?.length) {
    connection.password = options.DB_PASSWORD
  } else if (!isSocketPath) {
    throw new Error(`${options.isMigration ? 'MIGRATE_TO_' : ''}DB_PASSWORD must be set when DB_ADAPTER is 'postgres' and DB_HOST is not a socket directory path. If you don't already have one, use something long and random like:
    ${generate({ length: 32, numbers: true })}`)
  }

  if (!isSocketPath) {
    connection.ssl = options.DB_SSL ? { rejectUnauthorized: !!options.DB_SSL_VERIFICATION } : false
  }

  return {
    client: 'pg',
    useNullAsDefault: true,
    connection,
  }
}

function connectionSQLite(): Knex.Config {
  if (!fs.existsSync('./db')) {
    fs.mkdirSync('./db', {
      recursive: true,
    })
  }

  return {
    client: 'better-sqlite3',
    connection: {
      filename: './db/db.sqlite',
    },
    useNullAsDefault: true,
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
