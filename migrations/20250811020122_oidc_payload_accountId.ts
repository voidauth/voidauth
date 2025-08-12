import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('oidc_payloads', (table) => {
    table.text('accountId')
  })

  const oidcPayloads: { id: string, type: string, payload: string }[] = await knex.select().table('oidc_payloads')
  for (const o of oidcPayloads) {
    await knex.table('oidc_payloads').update({ accountId: (JSON.parse(o.payload).accountId ?? null) as string | null })
      .where({ id: o.id, type: o.type })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('oidc_payloads', (table) => {
    table.dropColumn('accountId')
  })
}
