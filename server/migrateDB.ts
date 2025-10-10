import knex from 'knex'
import { getConnectionOptions } from './db/connection'
import { connectionOptions, runMigrations, transaction } from './db/db'
import { als } from './util/als'
import appConfig from './util/config'
import { exit } from 'process'
import { TABLES } from '@shared/constants'

export async function migrate() {
  if (!appConfig.MIGRATE_TO_DB_ADAPTER) {
    console.error('Migration failed, environment variable MIGRATE_TO_DB_ADAPTER is not set')
    exit(1)
  }

  // if MIGRATE_TO_DB_ADAPTER is set, attempt to migrate existing DB to a new DB
  await als.run({}, async () => {
    // start transaction on existing DB
    await transaction()

    // Get connected to new DB
    let newConnectionOptions: knex.Knex.Config
    try {
      newConnectionOptions = getConnectionOptions({
        DB_ADAPTER: appConfig.DB_ADAPTER,
        DB_HOST: appConfig.DB_HOST,
        DB_PORT: appConfig.DB_PORT,
        DB_USER: appConfig.DB_USER,
        DB_NAME: appConfig.DB_NAME,
        DB_PASSWORD: appConfig.DB_PASSWORD,
      }, true)
    } catch (e) {
      console.error(typeof e === 'object' && e != null && 'message' in e ? e.message : e)
      exit(1)
    }

    if (connectionOptions.client === newConnectionOptions.client) {
      console.error('Cannot migrate between the same DB_ADAPTER types.')
      exit(1)
    }

    const newDB = knex(newConnectionOptions)

    // run migrations on new DB
    await runMigrations(newDB)

    const _tableNames = Object.values(TABLES)

    // TODO: clear data from new DB

    // TODO: copy data from existing DB, copy to new DB
  })
}
