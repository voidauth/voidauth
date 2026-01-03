import { exit } from 'process'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { booleanString } from './util/util.ts'
import { logger } from './util/logger.ts'

// Configure some env variables for dependencies in advance of importing them
// For this to work, no static import statement in this file can import the following:
// 'express', 'oidc-provider'
process.env.NODE_ENV ??= 'production'
// determine correct DEBUG env var
process.env.DEBUG_HIDE_DATE = 'true'
if (booleanString(process.env.ENABLE_DEBUG) || booleanString(process.env.DEBUG)) {
  process.env.ENABLE_DEBUG = 'true'
  process.env.DEBUG = 'oidc-provider:*'
} else {
  process.env.ENABLE_DEBUG = 'false'
  process.env.DEBUG = 'oidc-provider:server_error'
}

// Follow process flow depending on input arguments
// TODO: this (and the cli file structure) are a bit of a mess, organize
export const argv = yargs(hideBin(process.argv))
  .version(false)
  .scriptName('voidauth')
  .usage('Usage: voidauth <command> [options]')
  .command(['serve', '$0'], 'Default, serve voidauth application.', {}, async () => {
    logger.info(`

 __   __ ______   __   _____    ______   __  __   ______  __  __   
/\\ \\ / //\\  __ \\ /\\ \\ /\\  __ \\ /\\  __ \\ /\\ \\/\\ \\ /\\__  _\\/\\ \\_\\ \\  
\\ \\ \\ / \\ \\ \\/\\ \\\\ \\ \\\\ \\ \\/\\ \\\\ \\  __ \\\\ \\ \\_\\ \\\\/_/\\ \\/\\ \\  __ \\ 
 \\ \\_/   \\ \\_____\\\\ \\_\\\\ \\_____\\\\ \\_\\ \\_\\\\ \\_____\\  \\ \\_\\ \\ \\_\\ \\_\\
  \\//     \\/_____/ \\/_/ \\/_____/ \\/_/\\/_/ \\/_____/   \\/_/  \\/_/\\/_/

        ## Single Sign-On for Your Self-Hosted Universe ##

`)
    try {
      const server = await import('./cli/server.ts')
      void server.serve()
    } catch (e) {
      logger.error(e)
      exit(1)
    }
  })
  .command('migrate',
    `Migrate all data from the current database to the database specified by MIGRATE_TO_DB_* environment variables.`,
    {},
    async () => {
      try {
        const migrate = await import('./cli/migrateDB.ts')
        await migrate.migrate()
        logger.info('Database migration completed successfully, adjust your DB_* environment variables and restart.')
        exit(0)
      } catch (e) {
        logger.error(e)
        exit(1)
      }
    })
  .command(
    'generate password-reset [username]',
    'Generate a password reset link for an existing user.',
    yg => yg
      .positional('username', { type: 'string', describe: 'Existing user username' })
      .option('username', {
        alias: 'u',
        type: 'string',
        describe: 'Existing user username',
      }),
    async (argv) => {
      try {
        if (!argv.username) {
          logger.error('Username must be specified')
          exit(2)
        }
        const gpr = await import('./cli/generatePasswordReset.ts')
        const result = await gpr.generatePasswordReset(argv.username)
        logger.info(`\nPassword Reset link created: \n\n${result}\n`)
        exit(0)
      } catch (e) {
        logger.error(e)
        exit(1)
      }
    },
  )
  .parse()
