import { exit } from 'process'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { booleanString } from './util/util.ts'

process.env.NODE_ENV ??= 'production'

// determine correct DEBUG env var
process.env.DEBUG_HIDE_DATE = 'true'
if (booleanString(process.env.ENABLE_DEBUG) || booleanString(process.env.DEBUG)) {
  process.env.DEBUG = 'voidauth:*,oidc-provider:*'
} else {
  process.env.DEBUG = 'voidauth:*error,oidc-provider:server_error'
}

export const argv = yargs(hideBin(process.argv))
  .version(false)
  .scriptName('voidauth')
  .usage('Usage: voidauth <command> [options]')
  .command(['serve', '$0'], 'Default, serve voidauth application.', {}, async () => {
    try {
      const server = await import('./server.ts')
      void server.serve()
    } catch (e) {
      console.error(e)
      exit(1)
    }
  })
  .command('migrate',
    `Migrate all data from the current database to the database specified by MIGRATE_TO_DB_* environment variables.`,
    {},
    async () => {
      try {
        const migrate = await import('./migrateDB.ts')
        await migrate.migrate()
        console.log('Database migration completed successfully, adjust your DB_* environment variables and restart.')
        exit(0)
      } catch (e) {
        console.error(e)
        exit(1)
      }
    })
  .parse()
