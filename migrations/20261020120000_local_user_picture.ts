import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('user', (table) => {
    table.text('picture').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('user', (table) => {
    table.dropColumn('picture')
  })
}
