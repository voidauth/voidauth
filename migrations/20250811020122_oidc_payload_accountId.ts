import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('oidc_payloads', (table) => {
    table.text('accountId')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('oidc_payloads', (table) => {
    table.dropColumn('accountId')
  })
}
