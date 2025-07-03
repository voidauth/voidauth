import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .createTable('passkey', (table) => {
      table.text('id').primary().notNullable()
      table.binary('publicKey').notNullable()
      table.uuid('userId').notNullable().references('id').inTable('user').onDelete('CASCADE')
      table.text('webAuthnUserID').notNullable()
      table.bigint('counter').notNullable()
      table.text('deviceType').notNullable()
      table.boolean('backedUp').notNullable()
      table.text('transports')
    })
    .createTable('passkey_registration', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('userId').unique().notNullable().references('id').inTable('user').onDelete('CASCADE')
      table.text('value').notNullable() // encrypted
      table.timestamp('expiresAt', { useTz: true }).notNullable()
    })
    .createTable('passkey_authentication', (table) => {
      table.uuid('id').primary().notNullable()
      table.text('interactionId').unique().notNullable()
      table.text('value').notNullable() // encrypted
      table.timestamp('expiresAt', { useTz: true }).notNullable()
    })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .dropTable('passkey_authentication')
    .dropTable('passkey_registration')
    .dropTable('passkey')
}
