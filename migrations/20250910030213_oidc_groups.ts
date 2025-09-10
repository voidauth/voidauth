import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('oidc_group', (table) => {
    table.text('oidcId').notNullable()
    table.text('oidcType').notNullable()
    table.uuid('groupId').notNullable().references('id').inTable('group').onDelete('CASCADE')
    table.uuid('createdBy').notNullable()
    table.uuid('updatedBy').notNullable()
    table.timestamp('createdAt', { useTz: true }).notNullable()
    table.timestamp('updatedAt', { useTz: true }).notNullable()

    table.primary(['oidcId', 'oidcType', 'groupId'])

    table.foreign(['oidcId', 'oidcType'])
      .references(['id', 'type'])
      .inTable('oidc_payloads')
      .onDelete('CASCADE')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .dropTable('oidc_group')
}
