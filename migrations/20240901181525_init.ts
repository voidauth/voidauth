import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .createTable('key', (table) => {
      table.uuid('id').primary().notNullable()
      table.text('type').notNullable()
      table.text('value').notNullable() // encrypted
      table.timestamp('expiresAt', { useTz: true }).notNullable()

      // eslint-disable-next-line @stylistic/quotes
      table.check("type in ('oidc_jwk', 'cookie_key')", [], 'key_type_check')
    })
    .createTable('flag', (table) => {
      table.text('name').primary().notNullable()
      table.text('value')
      table.timestamp('createdAt', { useTz: true }).notNullable()
    })
    .createTable('user', (table) => {
      table.uuid('id').primary().notNullable()
      table.text('email')
      table.text('username').unique().notNullable()
      table.text('name')
      table.text('passwordHash').notNullable()
      table.boolean('emailVerified').notNullable().defaultTo(false) // email was verified
      table.boolean('approved').notNullable().defaultTo(false) // user was approved by an admin

      table.timestamp('createdAt', { useTz: true }).notNullable()
      table.timestamp('updatedAt', { useTz: true }).notNullable()

      // Email should be unique or null
      table.unique('email', {
        predicate: knex.whereNotNull('email'),
      })
    })
    .createTable('group', (table) => {
      table.uuid('id').primary().notNullable()
      table.text('name').notNullable().unique()
      table.uuid('createdBy').notNullable()
      table.uuid('updatedBy').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()
      table.timestamp('updatedAt', { useTz: true }).notNullable()
    })
    .createTable('user_group', (table) => {
      table.uuid('userId').notNullable().references('id').inTable('user').onDelete('CASCADE')
      table.uuid('groupId').notNullable().references('id').inTable('group').onDelete('CASCADE')
      table.uuid('createdBy').notNullable()
      table.uuid('updatedBy').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()
      table.timestamp('updatedAt', { useTz: true }).notNullable()

      table.unique(['userId', 'groupId'])
    })
    .createTable('consent', (table) => {
      table.uuid('userId').notNullable().references('id').inTable('user').onDelete('CASCADE')
      table.text('redirectUri').notNullable()
      table.text('scope').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()

      table.timestamp('expiresAt', { useTz: true }).notNullable()

      table.unique(['userId', 'redirectUri'])
    })
    .createTable('email_verification', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('userId').notNullable().references('id').inTable('user').onDelete('CASCADE')
      table.text('email').notNullable()
      table.text('challenge').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()
      table.timestamp('expiresAt', { useTz: true }).notNullable()
    })
    .createTable('password_reset', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('userId').notNullable().references('id').inTable('user').onDelete('CASCADE')
      table.text('challenge').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()
      table.timestamp('expiresAt', { useTz: true }).notNullable()
    })
    .createTable('invitation', (table) => {
      table.uuid('id').primary().notNullable()
      table.text('email')
      table.text('username')
      table.text('name')
      table.text('challenge').notNullable()
      table.boolean('emailVerified').notNullable().defaultTo(false)
      table.uuid('createdBy').notNullable()
      table.uuid('updatedBy').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()
      table.timestamp('updatedAt', { useTz: true }).notNullable()
      table.timestamp('expiresAt', { useTz: true }).notNullable()
    })
    .createTable('invitation_group', (table) => {
      table.uuid('invitationId').notNullable().references('id').inTable('invitation').onDelete('CASCADE')
      table.uuid('groupId').notNullable().references('id').inTable('group').onDelete('CASCADE')
      table.uuid('createdBy').notNullable()
      table.uuid('updatedBy').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()
      table.timestamp('updatedAt', { useTz: true }).notNullable()

      table.unique(['invitationId', 'groupId'])
    })
    .createTable('proxy_auth', (table) => {
      table.uuid('id').primary().notNullable()
      table.text('domain').notNullable()
      table.uuid('createdBy').notNullable()
      table.uuid('updatedBy').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()
      table.timestamp('updatedAt', { useTz: true }).notNullable()

      table.unique(['domain'])
    })
    .createTable('proxy_auth_group', (table) => {
      table.uuid('proxyAuthId').notNullable().references('id').inTable('proxy_auth').onDelete('CASCADE')
      table.uuid('groupId').notNullable().references('id').inTable('group').onDelete('CASCADE')
      table.uuid('createdBy').notNullable()
      table.uuid('updatedBy').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable()
      table.timestamp('updatedAt', { useTz: true }).notNullable()

      table.unique(['proxyAuthId', 'groupId'])
    })
};

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .dropTable('proxy_auth_group')
    .dropTable('proxy_auth')
    .dropTable('invitation_group')
    .dropTable('invitation')
    .dropTable('password_reset')
    .dropTable('email_verification')
    .dropTable('consent')
    .dropTable('user_group')
    .dropTable('group')
    .dropTable('user')
    .dropTable('key')
};
