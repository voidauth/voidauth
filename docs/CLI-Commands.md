# CLI Commands

The CLI Command interface can be accessed by running VoidAuth with arguments. One way to accomplish this is to use your existing application compose file, running commands in the format `docker compose run voidauth <command> [options]` from within the same directory as the `compose.yaml`. Documentation for CLI Commands will omit the method for running the selected commands, ex. `voidauth migrate`.

## Serve

`voidauth serve`

This is the default command if none are supplied, and starts the VoidAuth application.

## Migrate

`voidauth migrate`

Migrates all data from the current database to the database specified by the `MIGRATE_TO_*` environment variables. Read more on the [Database Migration](DB-Migration.md) page.

## Generate

### Generate Random Value

`voidauth generate random`

Generates a random hexadecimal value with 192-bits of entropy. Can be used to generate random values for [environment variables](Configuration.md#environment-variables).

## User

### Manage MFA (Multi-Factor Authentication)

`voidauth user mfa <action> [username]`

Enables or disables MFA for an existing user. The `action` can be `enable` or `disable`. The `username` parameter can be supplied positionally, for example `voidauth user mfa enable example_user`, or by flag, for example `voidauth user mfa enable --username example_user`. Enabling MFA for a user will require them to set up an MFA method the next time they use VoidAuth.

### Password Reset

`voidauth user password-reset [username]`

Generates a password reset link for an existing user. The `username` parameter can be supplied positionally `voidauth user password-reset example_user` or by flag `voidauth user password-reset --username example_user`.

### Import Users

`voidauth user import <file>`

Creates users from a JSON file that contains an existing password hash, so those users keep their current passwords. This is the command used by the [Migrating From Authentik](Migrating-From-Authentik.md) guide.

The file can be passed by path, or read from stdin. Reading from stdin avoids mounting or copying the file into the container:

```bash
docker compose run --rm -T voidauth user import /dev/stdin < users.json
```

`-T` is required. `--rm` stops a stopped container from lingering after the command exits.

The file is a JSON array of objects. Unknown keys are refused, so a typo cannot silently weaken an account.

| Field | Rule | Default |
| --- | --- | --- |
| `username` | Required. Same rule as registration: letters, digits, underscore, 1 to 32 characters | none |
| `email` | Optional. Valid email, empty string means none | `null` |
| `name` | Optional. At most 64 characters, longer is refused | `null` |
| `passwordHash` | Required key. A supported hash, or `null` for a user who must reset their password | none |
| `emailVerified` | Boolean. Refused as `true` when there is no email | `false` |
| `mfaRequired` | Boolean | `false` |

Example entry:

```json
[
  {
    "username": "example",
    "email": "example@example.com",
    "name": "Example User",
    "passwordHash": "pbkdf2_sha256$<iterations>$<salt>$<digest>",
    "emailVerified": false,
    "mfaRequired": false
  }
]
```

#### Supported Hashes

PBKDF2-SHA256 only, in Django format `pbkdf2_sha256$<iterations>$<salt>$<digest>` or passlib format `$pbkdf2-sha256$<iterations>$<salt>$<digest>`.

Limits: a 32 byte digest, a salt of at least 8 bytes, and iterations from 10,000 to 5,000,000. Anything else is refused, including argon2, bcrypt, `!`-prefixed values and empty strings.

On the first successful use of the password (web login, ProxyAuth basic auth, LDAP bind or password change) the hash is replaced with argon2id. The password is unchanged and users do not notice.

#### Behaviour

The import is all or nothing. Every problem is reported and nothing is written if any entry is invalid.

Existing users are never changed. A username or email address already in use, in any letter case, is refused, as is a repeat inside the file. The username `auth_admin` is reserved in any case.

Imported users are approved, and get the groups marked to auto-assign, like a user who registers without an invitation. Other groups are not assigned.

A user with `passwordHash` set to `null` cannot log in with a password. `voidauth user password-reset <username>` gives them a link that sets one.

#### Output

On success:

```
Imported 10 user(s), 2 without a password.
```

Problems are printed one per line, for example:

```
Entry 3 (bob): username is reserved or already taken.
Entry 1: username is invalid (invalid_format).
```

Entries count from 0. Values from the file other than a valid username are not printed, because they might be a misplaced hash. A failed import ends with a summary:

```
Nothing was imported, 20 problem(s) found.
```

#### Exit Codes

- `0`: success.
- `1`: failure, or any problem in the file.
- `2`: no file given.

#### Running Against A Live Instance

Use the same image version as the server, as a newer CLI would migrate the live database.

With Postgres, importing works beside a running server. With SQLite, it works beside a running idle server and requires `/app/db` to be a mounted volume, which is already required.

Importing while the server is stopped or quiet is recommended. A long write lock makes the command fail at startup with `MigrationLocked ... database is locked`. Nothing is written in that case, so retry when the database is idle.

The full walkthrough for moving users from another system is on the [Migrating From Authentik](Migrating-From-Authentik.md) page.
