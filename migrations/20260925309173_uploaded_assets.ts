import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('uploaded_asset', (table) => {
    table.text('contentHash').primary().notNullable()
    table.text('filePath').notNullable().unique()
    table.integer('byteSize').notNullable()
    table.timestamp('createdAt', { useTz: true }).notNullable()
    table.timestamp('updatedAt', { useTz: true }).notNullable()
  })

  await knex.schema.createTable('client_logo_asset', (table) => {
    table.uuid('id').primary().notNullable()
    table.text('uploadedHash').notNullable().references('contentHash').inTable('uploaded_asset').onDelete('CASCADE')
    table.text('clientId').unique().notNullable()
    table.text('clientType').notNullable().defaultTo('Client')
    table.timestamp('createdAt', { useTz: true }).notNullable()
    table.timestamp('updatedAt', { useTz: true }).notNullable()

    table.foreign(['clientId', 'clientType'])
      .references(['id', 'type'])
      .inTable('oidc_payloads')
      .onDelete('CASCADE')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('client_logo_asset')
  await knex.schema.dropTable('uploaded_asset')
}
