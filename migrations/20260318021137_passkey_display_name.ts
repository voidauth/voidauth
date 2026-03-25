import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // add displayName column to passkey table
  await knex.schema.table('passkey', (table) => {
    table.text('displayName').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('passkey', (table) => {
    table.dropColumn('displayName')
  })
}
