import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // add sessionMaxLength to proxy_auth
  await knex.schema.table('proxy_auth', (table) => {
    table.bigint('maxSessionLength').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('proxy_auth', (table) => {
    table.dropColumn('maxSessionLength')
  })
}
