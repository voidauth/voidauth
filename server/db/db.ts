import knex from 'knex'
import path from 'path'
import appConfig from '../util/config'
import fs from 'node:fs'

const SQLITE_DIR = appConfig.SQLITE_DIR

if (!fs.existsSync(SQLITE_DIR)) {
  fs.mkdirSync(SQLITE_DIR, {
    recursive: true
  })
}

export const db = knex({
  client: 'sqlite3', // or 'better-sqlite3'
  connection: {
    filename: path.join(SQLITE_DIR, "db.sqlite"),
    // host: '127.0.0.1',
    // port: 3306,
    // user: 'your_database_user',
    // password: 'your_database_password',
    // database: 'myapp_test',
  },
  pool: {
    afterCreate: (conn: any, done: any) => conn.run("PRAGMA foreign_keys = ON", done)
  },
  useNullAsDefault: true
})
/**
 * @type {[count: number, ran: string[]]}
 */
let [,migrations] = await db.migrate.latest({
  loadExtensions: ['.ts']
})

if (migrations.length) {
  console.log(`Ran Migrations: ${migrations.join(", ")}`)
}
