# CLI Commands

The CLI Command interface can be accessed by running VoidAuth with arguments. One way to accomplish this is to use your existing application compose file, running commands in the format `docker compose run voidauth <command> [options]` from within the same directory as the `compose.yaml`. Documentation for CLI Commands will omit the method for running the selected commands, ex. `voidauth migrate`.

## Serve

`voidauth serve`

This is the default command if none are supplied, and starts the VoidAuth application.

## Migrate

`voidauth migrate`

Migrates all data from the current database to the database specified by the `MIGRATE_TO_*` environment variables. Read more on the [Database Migration](DB-Migration.md) page.

## Generate

### Generate Password Reset

`voidauth generate password-reset [username]`

Generates a password reset link for an existing user. The `username` parameter can be supplied positionally `voidauth generate password-reset example_user` or by flag `voidauth generate password-reset --username example_user`.
