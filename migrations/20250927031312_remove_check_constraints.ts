import type { Knex } from 'knex'

// ---------------------------------
// Check Constraints are not really
//  well supported in sqlite
//  so remove them from if pg
// ---------------------------------

export async function up(knex: Knex): Promise<void> {
  if (knex.client.config.client === 'pg') {
    await knex.raw(`alter table "email_log" drop constraint if exists email_log_types`)
    await knex.raw(`alter table "key" drop constraint if exists key_type_check`)
  }
}

export async function down(knex: Knex): Promise<void> {
  if (knex.client.config.client === 'pg') {
    await knex.schema.table('email_log', (table) => {
      // eslint-disable-next-line @stylistic/quotes
      table.check("type in ('email_verification', 'password_reset', 'invitation', 'admin_notification', 'approved')", [], 'email_log_types')
    })
    await knex.schema.table('key', (table) => {
      // eslint-disable-next-line @stylistic/quotes
      table.check("type in ('oidc_jwk', 'cookie_key')", [], 'key_type_check')
    })
  }
}
