import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .createTable('constant', (table) => {
      table.string('key').primary().notNullable()
      table.string('value')
    })
    .createTable('user', (table) => {
      table.string('id').primary().notNullable()
      table.string('email')
      table.string('username').unique().notNullable()
      table.string('name')
      table.string('passwordHash').notNullable()
      table.boolean('emailVerified').notNullable().defaultTo(false) // email was verified
      table.boolean('approved').notNullable().defaultTo(false) // user was approved by an admin

      table.string('createdAt').notNullable()
      table.string('updatedAt').notNullable()

      // Email should be unique or null
      table.unique('email', {
        predicate: knex.whereNotNull('email'),
      })
    })
    .createTable('group', (table) => {
      table.string('id').primary().notNullable()
      table.string('name').notNullable().unique()
      table.string('createdBy').notNullable().references('id').inTable('user')
      table.string('updatedBy').notNullable().references('id').inTable('user')
      table.string('createdAt').notNullable()
      table.string('updatedAt').notNullable()
    })
    .createTable('user_group', (table) => {
      table.string('userId').notNullable().references('id').inTable('user').onDelete('CASCADE')
      table.string('groupId').notNullable().references('id').inTable('group').onDelete('CASCADE')
      table.string('createdBy').notNullable().references('id').inTable('user')
      table.string('updatedBy').notNullable().references('id').inTable('user')
      table.string('createdAt').notNullable()
      table.string('updatedAt').notNullable()

      table.unique(['userId', 'groupId'])
    })
    .createTable('consent', (table) => {
      table.string('userId').notNullable().references('id').inTable('user').onDelete('CASCADE')
      table.string('redirectUri').notNullable()
      table.string('scope').notNullable()
      table.string('createdAt').notNullable()

      table.string('expiresAt').notNullable()

      table.unique(['userId', 'redirectUri'])
    })
    .createTable('email_verification', (table) => {
      table.string('userId').primary().notNullable().references('id').inTable('user').onDelete('CASCADE')
      table.string('email').notNullable()
      table.string('challenge').notNullable()
      table.string('createdAt').notNullable()
      table.string('createdBy').notNullable().references('id').inTable('user')
      table.string('expiresAt').notNullable()
    })
    .createTable('invitation', (table) => {
      table.string('id').primary().notNullable()
      table.string('email')
      table.string('username')
      table.string('name')
      table.string('challenge').notNullable()
      table.string('createdBy').notNullable().references('id').inTable('user')
      table.string('updatedBy').notNullable().references('id').inTable('user')
      table.string('createdAt').notNullable()
      table.string('updatedAt').notNullable()
      table.string('expiresAt').notNullable()
    })
    .createTable('invitation_group', (table) => {
      table.string('invitationId').notNullable().references('id').inTable('invitation').onDelete('CASCADE')
      table.string('groupId').notNullable().references('id').inTable('group').onDelete('CASCADE')
      table.string('createdBy').notNullable().references('id').inTable('user')
      table.string('updatedBy').notNullable().references('id').inTable('user')
      table.string('createdAt').notNullable()
      table.string('updatedAt').notNullable()

      table.unique(['invitationId', 'groupId'])
    })
};

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .dropTable('invitation')
    .dropTable('email_verification')
    .dropTable('consent')
    .dropTable('user_group')
    .dropTable('group')
    .dropTable('user')
    .dropTable('constant')
};
