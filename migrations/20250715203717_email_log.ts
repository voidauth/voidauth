import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .createTable('email_log', (table) => {
      table.uuid('id').primary().notNullable()
      table.text('type').notNullable()

      table.uuid('toUser') // do not fk, this is a log table
      table.timestamp('createdAt', { useTz: true }).notNullable()

      table.text('to').notNullable()
      table.text('cc')
      table.text('bcc')
      table.text('subject').notNullable()
      table.text('body')

      table.text('reasons') // optional, searchable text to narrow down if an email needs to be sent

      // eslint-disable-next-line @stylistic/quotes
      table.check("type in ('email_verification', 'password_reset', 'invitation', 'admin_notification')", [], 'email_log_types')
    })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .dropTable('email_log')
}
