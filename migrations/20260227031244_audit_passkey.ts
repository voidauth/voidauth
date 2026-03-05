import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // add audit columns to passkey table
  await knex.schema.table('passkey', (table) => {
    table.timestamp('createdAt', { useTz: true }).nullable()
    table.timestamp('lastUsed', { useTz: true }).nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('passkey', (table) => {
    table.dropColumn('createdAt')
    table.dropColumn('lastUsed')
  })
}
