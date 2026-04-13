import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('group', (table) => {
    table.boolean('autoAssign').nullable()
  })
  await knex.table('group').update({ autoAssign: false })
  await knex.schema.table('group', (table) => {
    table.dropNullable('autoAssign')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('group', (table) => {
    table.dropColumn('autoAssign')
  })
}
