import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // create totp table
  await knex.schema.createTable('totp', (table) => {
    table.uuid('id').primary().notNullable()
    table.uuid('userId').notNullable().references('id').inTable('user').onDelete('CASCADE')
    table.text('secret').notNullable()
    table.timestamp('expiresAt', { useTz: true })

    table.timestamp('createdAt', { useTz: true }).notNullable()
    table.timestamp('updatedAt', { useTz: true }).notNullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('totp')
}
