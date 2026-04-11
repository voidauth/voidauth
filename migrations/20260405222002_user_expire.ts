import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // add expiresAt to user table
  await knex.schema.table('user', (table) => {
    table.timestamp('expiresAt', { useTz: true }).nullable()
  })
  // add userExpiresAt to invitation table
  await knex.schema.table('invitation', (table) => {
    table.timestamp('userExpiresAt', { useTz: true }).nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('user', (table) => {
    table.dropColumn('expiresAt')
  })
  await knex.schema.table('invitation', (table) => {
    table.dropColumn('userExpiresAt')
  })
}
