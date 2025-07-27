import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .table('email_log', (table) => {
      table.dropChecks('email_log_types')

      // eslint-disable-next-line @stylistic/quotes
      table.check("type in ('email_verification', 'password_reset', 'invitation', 'admin_notification', 'approved')", [], 'email_log_types')
    })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .table('email_log', (table) => {
      table.dropChecks('email_log_types')

      // eslint-disable-next-line @stylistic/quotes
      table.check("type in ('email_verification', 'password_reset', 'invitation', 'admin_notification')", [], 'email_log_types')
    })
}
