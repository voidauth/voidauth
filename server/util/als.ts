import { AsyncLocalStorage } from 'async_hooks'
import type { Knex } from 'knex'

export const als = new AsyncLocalStorage<{ transaction?: Knex.Transaction }>()
