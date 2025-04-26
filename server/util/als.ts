import { AsyncLocalStorage } from 'async_hooks'
import type { Knex } from 'knex'

export const als = new AsyncLocalStorage()

export function getAsyncStore() {
  return als.getStore() as { transaction?: Knex.Transaction } | undefined
}
