# Database Migration

An existing VoidAuth database can be migrated to a new database using the `MIGRATE_TO_DB_*` environment variables and `migrate` command. See the **Database Migration Settings** section of the [Getting Started](Getting-Started.md#database-migration-settings) page for required environment variable information. The `MIGRATE_TO_DB_*` variables of the new database are the same as the `DB_*` variables of the existing database, and contain the configuration of the database you are migrating **to**.

>[!TIP]
> Database migration is **non-destructive** to the existing database described by the `DB_*` variables. It **IS** destructive to the database you are migrating **to**, described by the `MIGRATE_TO_DB_*` variables, as it may remove data before copying from the existing database.

The following is the basic procedure for migrating **from** an existing database **to** a new database:

1. Stop/remove existing instances of VoidAuth, ex. `docker compose rm -s voidauth`.
2. Ensure that the database you are migrating **to** exists (Postgres) or can be created (SQLite). See the **Initial Setup** section of the [Getting Started](Getting-Started.md#initial-setup) page to see examples of a setup including a Postgres or SQLite database.
3. Configure `MIGRATE_TO_DB_*` environment variables with details of the new database. These variables *exactly* match how a connection to the database would be made with the `DB_*` variables.
4. Run the `migrate` command, ex. `docker compose run voidauth migrate`. This will run the database migration script, non-destructively migrating your install from the database described in the `DB_*` environment variables to the one described by the `MIGRATE_TO_DB_*` environment variables. Wait for a success message, ex. `Database migration complete...`
5. Change your `DB_*` environment variables of your VoidAuth install, these should be changed to match the `MIGRATE_TO_DB_*` variables used during migration. You may also remove the `MIGRATE_TO_DB_*` variables, as they are not used by VoidAuth except during migration.
6. Start VoidAuth, ex. `docker compose up -d voidauth`

