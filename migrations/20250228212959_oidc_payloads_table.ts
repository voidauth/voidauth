import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('oidc_payloads', (table) => {
    table.text('id')
    table.text('type')
    table.text('payload')
    table.text('grantId')
    table.text('userCode')
    table.text('uid')
    table.dateTime('expiresAt')
    table.dateTime('consumedAt')
    table.primary(['id', 'type'])
  })
};

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('oidc_payloads')
};
