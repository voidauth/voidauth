import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // table for custom scopes
  await knex.schema
    .createTable('custom_scope', (table) => {
      table.uuid('id').primary().notNullable()
      table.string('scope').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()
      table.timestamp('updatedAt', { useTz: true }).notNullable()

      table.unique(['scope'])
    })

  // table for custom claims
  await knex.schema
    .createTable('custom_claim', (table) => {
      table.uuid('id').primary().notNullable()
      table.string('scopeId').notNullable().references('id').inTable('custom_scope').onDelete('CASCADE')
      table.string('claim').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()
      table.timestamp('updatedAt', { useTz: true }).notNullable()

      table.unique(['scopeId', 'claim'])
    })

  // table for custom claims for a user
  await knex.schema
    .createTable('user_custom_claim', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('userId').notNullable().references('id').inTable('user').onDelete('CASCADE')
      table.uuid('claimId').notNullable().references('id').inTable('custom_claim').onDelete('CASCADE')
      table.string('value').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()

      table.unique(['userId', 'claimId'])
    })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .dropTable('invitation_custom_claim')
    .dropTable('user_custom_claim')
    .dropTable('custom_claim')
}
