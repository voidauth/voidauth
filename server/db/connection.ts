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
  // When running schema migrations with sqlite make sure foreign key checking is DISABLED to prevent data loss
  if (connectionOptions.client === 'sqlite3' || connectionOptions.client === 'better-sqlite') {
    const { pool, ...rest } = connectionOptions
    // create new connectionOptions object with foreign key checking DISABLED
    connectionOptions = { ...rest, pool: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      afterCreate: (conn: any, cb: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        conn.prepare('PRAGMA foreign_keys = OFF').run()
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        cb()
      },
    } }
  }

  const db = knex(connectionOptions)

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const [,migrations]: [number, string[]] = await db.migrate.latest({
    loadExtensions: ['.ts'],
  })
  if (connectionOptions.client === 'sqlite' || connectionOptions.client === 'better-sqlite3') {
    const violations = await db.raw<unknown[]>('PRAGMA foreign_key_check')
    if (violations.length) {
      logger({ level: 'error', message: 'foreign_key_check constraint violations detected in database!',
        error: {
          name: 'Foreign Key Check Violation',
          message: 'foreign_key_check constraint violations detected in database!',
        },
      })
    }
    console.log(violations)
  }
  await db.destroy()
  return migrations
}

export async function createDB(options: DBConnectionOptions) {
  const connOptions = getConnectionOptions(options)
  const migrations = await runSchemaUpdates(connOptions)
  if (migrations.length) {
    logger({ level: 'info', message: 'Database schema updated.' })
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

function connectionPg(options: DBConnectionOptions): Knex.Config & { connection: Knex.PgConnectionConfig } {
  // check that DB_HOST is set
  if (!options.DB_HOST?.length) {
    throw new Error(`${options.isMigration ? 'MIGRATE_TO_' : ''}DB_HOST must be set.`)
  }

  return {
    client: 'pg',
    useNullAsDefault: true,
    connection: {
      host: options.DB_HOST,
      port: options.DB_PORT ?? 5432,
      user: options.DB_USER ?? 'postgres',
      database: options.DB_NAME ?? 'postgres',
      ...(options.DB_PASSWORD ? { password: options.DB_PASSWORD } satisfies Pick<Knex.PgConnectionConfig, 'password'> : {}),
      ...(options.DB_SSL
        ? {
          ssl: { rejectUnauthorized: !!options.DB_SSL_VERIFICATION },
        } satisfies Pick<Knex.PgConnectionConfig, 'ssl'>
        : {}),
    } satisfies Knex.PgConnectionConfig,
  }
}

function connectionSQLite(): Knex.Config {
  if (!fs.existsSync('./db')) {
    fs.mkdirSync('./db', {
      recursive: true,
    })
  }

  const connectionOptions: Knex.Config = {
    client: 'better-sqlite3',
    connection: {
      filename: './db/db.sqlite',
    },
    useNullAsDefault: true,
    migrations: {
      // disable transactions for db migrations, they only work for postgres anyways and cause issues with sqlite dbs
      disableTransactions: true,
    },
  }

  // Make sure that for sqlite DBs foreign key checking is ENABLED
  if (connectionOptions.client === 'sqlite3' || connectionOptions.client === 'better-sqlite') {
    connectionOptions.pool = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      afterCreate: (conn: any, cb: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        conn.prepare('PRAGMA foreign_keys = ON').run()
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        cb()
      },
    }
  }

  return connectionOptions
}
