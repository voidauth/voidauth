import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('user', (table) => {
    table.boolean('mfaRequired').nullable()
  })
  await knex.table('user').update({ mfaRequired: false })
  const totpUserIds = await knex.table('totp').select()
  for (const t of totpUserIds) {
    await knex.table('user').update({ mfaRequired: true }).where({ id: t.userId as string })
  }
  await knex.schema.table('user', (table) => {
    table.dropNullable('mfaRequired')
  })

  await knex.schema.table('group', (table) => {
    table.boolean('mfaRequired').nullable()
  })
  await knex.table('group').update({ mfaRequired: false })
  await knex.schema.table('group', (table) => {
    table.dropNullable('mfaRequired')
  })

  await knex.schema.table('proxy_auth', (table) => {
    table.boolean('mfaRequired').nullable()
  })
  await knex.table('proxy_auth').update({ mfaRequired: false })
  await knex.schema.table('proxy_auth', (table) => {
    table.dropNullable('mfaRequired')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('group', (table) => {
    table.dropColumn('mfaRequired')
  })
  await knex.schema.table('user', (table) => {
    table.dropColumn('mfaRequired')
  })
}
