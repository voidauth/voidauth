import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('passkey', (table) => {
    table.boolean('canVerify').nullable()
  })
  await knex.table('passkey').update({ canVerify: false })
  await knex.schema.table('passkey', (table) => {
    table.dropNullable('canVerify')
  })

  await knex.schema.table('invitation', (table) => {
    table.boolean('mfaRequired').nullable()
  })
  await knex.table('invitation').update({ mfaRequired: false })
  await knex.schema.table('invitation', (table) => {
    table.dropNullable('mfaRequired')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('invitation', (table) => {
    table.dropColumn('mfaRequired')
  })
  await knex.schema.table('passkey', (table) => {
    table.dropColumn('canVerify')
  })
}
