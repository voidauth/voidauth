import { generate } from 'generate-password'
import fs from 'node:fs'

export function connectionPg(options: {
  DB_PASSWORD?: string
  DB_HOST?: string
  DB_PORT?: number
  DB_NAME?: string
  DB_USER?: string
}) {
  // check that DB_PASSWORD is set
  if (!options.DB_PASSWORD?.length) {
    throw new Error(`DB_PASSWORD must be set. If you don't already have one, use something long and random like:
    ${generate({ length: 32, numbers: true })}`)
  }

  // check that DB_HOST is set
  if (!options.DB_HOST?.length) {
    throw new Error('DB_HOST must be set.')
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

export function connectionSQLite() {
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
