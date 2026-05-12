import { commit, db, rollback, transaction } from '../db/db'
import { als } from '../util/als'
import appConfig from '../util/config'
import { exit } from 'process'
import { createDB } from '../db/connection'
import { logger, purgeAsyncLog } from '../util/logger'
import { BOOL_COLUMNS, DATE_COLUMNS, TABLES_ORDER } from '@shared/db'

export async function migrate() {
  if (appConfig.DB_ADAPTER === appConfig.MIGRATE_TO_DB_ADAPTER) {
    logger({
      level: 'error',
      message: 'Cannot migrate databases between the same DB_ADAPTER types.',
    })
    exit(1)
  }

  // if MIGRATE_TO_DB_ADAPTER is set, attempt to migrate existing DB to a new DB
  await als.run({}, async () => {
    // start transaction on existing DB
    await transaction()

    try {
      // Get connected to new DB
      const newDB = await createDB({
        DB_ADAPTER: appConfig.MIGRATE_TO_DB_ADAPTER,
        DB_HOST: appConfig.MIGRATE_TO_DB_HOST,
        DB_PORT: appConfig.MIGRATE_TO_DB_PORT,
        DB_USER: appConfig.MIGRATE_TO_DB_USER,
        DB_NAME: appConfig.MIGRATE_TO_DB_NAME,
        DB_PASSWORD: appConfig.MIGRATE_TO_DB_PASSWORD,
        DB_SSL: appConfig.MIGRATE_TO_DB_SSL,
        DB_SSL_VERIFICATION: appConfig.MIGRATE_TO_DB_SSL_VERIFICATION,
        isMigration: true,
      })

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
            if ((DATE_COLUMNS as unknown as string[]).includes(column)) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              row[column] = typeof row[column] === 'number' ? new Date(row[column]) : row[column]
            } else if ((BOOL_COLUMNS as unknown as string[]).includes(column)) {
              row[column] = !!row[column]
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
    } finally {
      purgeAsyncLog()
    }
  })
}
