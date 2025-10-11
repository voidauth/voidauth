import knex from 'knex'
import { getConnectionOptions } from './db/connection'
import { commit, db, rollback, runMigrations, transaction } from './db/db'
import { als } from './util/als'
import appConfig from './util/config'
import { exit } from 'process'
import { TABLES_ORDER } from '@shared/constants'

export async function migrate() {
  if (!appConfig.MIGRATE_TO_DB_ADAPTER) {
    console.error('Environment variable MIGRATE_TO_DB_ADAPTER is not set.')
    exit(1)
  }
  const newDBAdapter = appConfig.MIGRATE_TO_DB_ADAPTER

  if (appConfig.DB_ADAPTER === appConfig.MIGRATE_TO_DB_ADAPTER) {
    console.error('Cannot migrate databases between the same DB_ADAPTER types.')
    exit(1)
  }

  // if MIGRATE_TO_DB_ADAPTER is set, attempt to migrate existing DB to a new DB
  await als.run({}, async () => {
    // start transaction on existing DB
    await transaction()

    try {
      // Get connected to new DB
      let newConnectionOptions: knex.Knex.Config
      try {
        newConnectionOptions = getConnectionOptions({
          DB_ADAPTER: newDBAdapter,
          DB_HOST: appConfig.MIGRATE_TO_DB_HOST,
          DB_PORT: appConfig.MIGRATE_TO_DB_PORT,
          DB_USER: appConfig.MIGRATE_TO_DB_USER,
          DB_NAME: appConfig.MIGRATE_TO_DB_NAME,
          DB_PASSWORD: appConfig.MIGRATE_TO_DB_PASSWORD,
        }, true)
      } catch (e) {
        console.error(typeof e === 'object' && e != null && 'message' in e ? e.message : e)
        exit(1)
      }

      const newDB = knex(newConnectionOptions)

      // run migrations on new DB
      await runMigrations(newDB)

      // clear data from new DB
      for (const tableName of TABLES_ORDER.toReversed()) {
        await newDB.table(tableName).delete()
      }

      // copy data from existing DB to new DB
      for (const tableName of TABLES_ORDER) {
        const data = await db().table(tableName).select()

        // Find column names that need to be modified (dates and booleans)
        for (const row of data) {
          for (const column of Object.keys(row as object)) {
            switch (column) {
              case 'createdAt':
              case 'updatedAt':
              case 'expiresAt':
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                row[column] = new Date(row[column])
                break
              case 'emailVerified':
              case 'approved':
              case 'backedUp':
                row[column] = !!row[column]
                break
            }
          }
        }

        if (data.length) {
          await newDB.table(tableName).insert(data)
        }
      }

      await commit()
    } catch (e) {
      await rollback()
      throw e
    }
  })
}
