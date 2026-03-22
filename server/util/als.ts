import { AsyncLocalStorage } from 'async_hooks'
import type { Knex } from 'knex'
import type { LogShape } from './logger'

export const als = new AsyncLocalStorage<{ transaction?: Knex.Transaction, log?: LogShape }>()
