import { generate } from 'generate-password'
import type knex from 'knex'
import fs from 'node:fs'

export function getConnectionOptions(options: {
  DB_ADAPTER: string
  DB_PASSWORD?: string
  DB_HOST?: string
  DB_PORT?: number
  DB_NAME?: string
  DB_USER?: string
}, isMigration: boolean = false): knex.Knex.Config {
  if (options.DB_ADAPTER === 'postgres') {
    return connectionPg({
      DB_HOST: options.DB_HOST,
      DB_PORT: options.DB_PORT,
      DB_USER: options.DB_USER,
      DB_NAME: options.DB_NAME,
      DB_PASSWORD: options.DB_PASSWORD,
    }, isMigration)
  } else if (options.DB_ADAPTER === 'sqlite') {
    return connectionSQLite()
  } else {
    throw new Error(`${isMigration ? 'MIGRATE_TO_' : ''}DB_ADAPTER, if set, must be either 'postgres' or 'sqlite'.`)
  }
}

function connectionPg(options: {
  DB_PASSWORD?: string
  DB_HOST?: string
  DB_PORT?: number
  DB_NAME?: string
  DB_USER?: string
}, isMigration: boolean = false) {
  // check that DB_PASSWORD is set
  if (!options.DB_PASSWORD?.length) {
    throw new Error(`${isMigration ? 'MIGRATE_TO_' : ''}DB_PASSWORD must be set. If you don't already have one, use something long and random like:
    ${generate({ length: 32, numbers: true })}`)
  }

  // check that DB_HOST is set
  if (!options.DB_HOST?.length) {
    throw new Error(`${isMigration ? 'MIGRATE_TO_' : ''}DB_HOST must be set.`)
  }

  return {
    client: 'pg',
    useNullAsDefault: true,
    connection: {
      host: options.DB_HOST,
      port: options.DB_PORT ?? 5432,
      user: options.DB_USER ?? 'postgres',
      database: options.DB_NAME ?? 'postgres',
      password: options.DB_PASSWORD,
    },
  }
}

function connectionSQLite() {
  if (!fs.existsSync('./db')) {
    fs.mkdirSync('./db', {
      recursive: true,
    })
  }

  return {
    client: 'sqlite3',
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
