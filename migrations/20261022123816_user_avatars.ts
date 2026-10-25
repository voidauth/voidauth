import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.text('avatarHash').nullable().references('contentHash').inTable('uploaded_asset').onDelete('SET NULL')
  })
  await knex.schema.alterTable('invitation', (table) => {
    table.text('avatarHash').nullable().references('contentHash').inTable('uploaded_asset').onDelete('SET NULL')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invitation', (table) => {
    table.dropColumn('avatarHash')
  })
  await knex.schema.alterTable('user', (table) => {
    table.dropColumn('avatarHash')
  })
}
