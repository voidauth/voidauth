// Update with your config settings.

// Make migration with:
// npx knex migrate:make m_name

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
export default {
    migrations: {
        extension: 'ts',
    },
    client: 'pg',
}
