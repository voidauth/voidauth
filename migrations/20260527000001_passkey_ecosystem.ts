import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('passkey', (table) => {
    table.text('ecosystem').nullable()
  })
  await knex.schema.table('user', (table) => {
    table.text('passkeySkippedEcosystems').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('passkey', (table) => {
    table.dropColumn('ecosystem')
  })
  await knex.schema.table('user', (table) => {
    table.dropColumn('passkeySkippedEcosystems')
  })
}
