import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.delete().table('passkey_registration')
  await knex.schema
    .table('passkey_registration', (table) => {
      table.dropColumn('userId')
      table.text('uniqueId').unique().notNullable()
    })
    .table('user', (table) => {
      table.setNullable('passwordHash')
    })
}

export async function down(knex: Knex): Promise<void> {
  await knex.delete().table('passkey_registration')
  await knex.schema
    .table('user', (table) => {
      table.dropNullable('passwordHash')
    })
    .table('passkey_registration', (table) => {
      table.dropColumn('uniqueId')
      table.uuid('userId').unique().notNullable().references('id').inTable('user').onDelete('CASCADE')
    })
}
