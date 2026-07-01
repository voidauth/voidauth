/**
 * Add LDAP sync tracking columns to the user and group tables.
 *
 * ldapSource     — set to 'ldap' when the row is managed by LDAP sync.
 * ldapExternalId — the entry's full DN (users) or unique identifier
 *                  (groups) from the remote LDAP directory.
 */
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .alterTable('user', (table) => {
      table.text('ldapSource')
      table.text('ldapExternalId')
    })
    .alterTable('group', (table) => {
      table.text('ldapSource')
      table.text('ldapExternalId')
    })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .alterTable('user', (table) => {
      table.dropColumn('ldapSource')
      table.dropColumn('ldapExternalId')
    })
    .alterTable('group', (table) => {
      table.dropColumn('ldapSource')
      table.dropColumn('ldapExternalId')
    })
}
