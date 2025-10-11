import { exit } from 'process'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

export const argv = yargs(hideBin(process.argv))
  .version(false)
  .scriptName('voidauth')
  .usage('Usage: voidauth <command> [options]')
  .command(['serve', '$0'], 'Default, serve voidauth application.', {}, async () => {
    try {
      const server = await import('./server')
      server.serve()
    } catch (e) {
      console.error(typeof e === 'object' && e != null && 'message' in e ? e.message : e)
      exit(1)
    }
  })
  .command('migrate',
    `Migrate all data from the current database to the database specified by MIGRATE_TO_DB_* environment variables.`,
    {},
    async () => {
      try {
        const migrate = await import('./migrateDB')
        await migrate.migrate()
        console.log('Database migration completed successfully, adjust your DB_* environment variables and restart.')
        exit(0)
      } catch (e) {
        console.error(typeof e === 'object' && e != null && 'message' in e ? e.message : e)
        exit(1)
      }
    })
  .parse()
