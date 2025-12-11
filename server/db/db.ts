import appConfig from '../util/config'
import { als } from '../util/als'
import { createDB } from './connection'
import { logger } from '../util/logger'

export async function transaction() {
  const store = als.getStore()
  if (!store) {
    throw new Error('Cannot create transaction outside of async context.')
  }
  if (!store.transaction) {
    store.transaction = await db().transaction()
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

const _db = await createDB({
  DB_ADAPTER: appConfig.DB_ADAPTER,
  DB_HOST: appConfig.DB_HOST,
  DB_PORT: appConfig.DB_PORT,
  DB_USER: appConfig.DB_USER,
  DB_NAME: appConfig.DB_NAME,
  DB_PASSWORD: appConfig.DB_PASSWORD,
})

logger.info(`Connected to ${appConfig.DB_ADAPTER} database.`)

export function db() {
  return als.getStore()?.transaction ?? _db
}
