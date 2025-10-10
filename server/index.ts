import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

export const argv = yargs(hideBin(process.argv))
  .version(false)
  .scriptName('voidauth')
  .usage('Usage: voidauth <command> [options]')
  .command(['serve', '$0'], 'Default, serve voidauth application.', {}, async () => {
    const server = await import('./server')
    server.serve()
  })
  .command('migrate',
    `Migrate all data from the current database to the database specified by MIGRATE_TO_DB_* environment variables.`,
    {},
    async () => {
      const migrate = await import('./migrateDB')
      await migrate.migrate()
      console.log('Migration completed successfully!')
    })
  .parse()
