import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('totp_failed_attempt', (table) => {
    table.uuid('id').primary().notNullable()
    table.uuid('userId').notNullable().references('id').inTable('user').onDelete('CASCADE')
    table.timestamp('expiresAt', { useTz: true }).notNullable()
    table.timestamp('createdAt', { useTz: true }).notNullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('totp_failed_attempt')
}
