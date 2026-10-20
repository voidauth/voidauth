import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('user', (table) => {
    table.boolean('skipPasskeyPrompt').nullable()
  })
  await knex.table('user').update({ skipPasskeyPrompt: false })
  await knex.schema.table('user', (table) => {
    table.dropNullable('skipPasskeyPrompt')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('user', (table) => {
    table.dropColumn('skipPasskeyPrompt')
  })
}
