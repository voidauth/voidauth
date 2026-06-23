import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // table for custom claims
  await knex.schema
    .createTable('custom_claim', (table) => {
      table.uuid('id').primary().notNullable()
      table.string('scope').notNullable()
      table.string('claim').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()
      table.timestamp('updatedAt', { useTz: true }).notNullable()

      table.unique(['scope', 'claim'])
    })

  // table for custom claims for a user
  await knex.schema
    .createTable('user_custom_claim', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('userId').notNullable().references('id').inTable('user').onDelete('CASCADE')
      table.uuid('claimId').notNullable().references('id').inTable('custom_claim').onDelete('CASCADE')
      table.string('value').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()

      table.unique(['userId', 'claim'])
    })

  // table for custom claims for an invitation
  await knex.schema
    .createTable('invitation_custom_claim', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('invitationId').notNullable().references('id').inTable('invitation').onDelete('CASCADE')
      table.uuid('claimId').notNullable().references('id').inTable('custom_claim').onDelete('CASCADE')
      table.string('value').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()

      table.unique(['invitationId', 'claimId'])
    })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .dropTable('invitation_custom_claim')
    .dropTable('user_custom_claim')
    .dropTable('custom_claim')
}
