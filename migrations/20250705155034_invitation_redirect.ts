import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invitation', (table) => {
    table.text('redirect')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invitation', (table) => {
    table.dropColumn('redirect')
  })
}
