# Fork: `picture` claim

This fork adds a per-user profile picture URL. It is released as the standard OIDC claim
`picture` in the `profile` scope.

## Changed files

| File | Change |
| --- | --- |
| `migrations/20261020120000_local_user_picture.ts` | Adds a nullable `text` column `picture` to `user` (`down()` drops it) |
| `shared/db/User.ts` | `picture?: string \| null` |
| `shared/validators.ts` | `pictureValidation`: empty string → `null`, otherwise an http(s) URL of at most 2048 characters |
| `shared/api-request/UpdateProfile.ts` | Accepts `picture` (PATCH `/api/user/profile`) |
| `shared/api-request/admin/UserUpdate.ts` | Accepts `picture` (PATCH `/api/admin/user`) |
| `server/db/claims.ts` | `'picture'` enabled in the `profile` scope |
| `server/db/user.ts` | `findAccount().claims()` sets `picture` when the `profile` scope is granted |
| `frontend/src/app/pages/home/*` | Profile page: URL field with a small round preview |
| `frontend/src/app/pages/admin/users/user/*` | Admin user form: URL field |
| `frontend/public/i18n/en-US.json`, `de-DE.json` | Labels (`de-DE` has no `admin.user` block and falls back to English) |

The routes save the validated body as-is, so they need no changes.

## Updating from upstream

```sh
git remote add upstream https://github.com/voidauth/voidauth.git   # once
git fetch upstream
git rebase upstream/main
# resolve conflicts, then:
npm ci && (cd frontend && npm ci)
npx tsc && npx eslint ./
git push --force-with-lease
```

Conflicts usually show up in `server/db/user.ts` (the claims type and the `profile` block) and in the
i18n JSON files.

## About the `local_` migration

- knex runs migrations in filename (timestamp) order and records each applied one in `knex_migrations`.
- If upstream later ships a migration with an **older** timestamp than this one, knex still runs it,
  just after this one (out of order). That only matters if it touches `user.picture`, so take a look
  at new upstream migrations after every rebase.
- If upstream ships migrations with **newer** timestamps, nothing needs to be done.
- **Never rename or delete** this file once it has run on a DB. knex then finds a row in
  `knex_migrations` without a matching file and refuses to start ("migration directory is corrupt").

## Going back to upstream

If upstream adds `picture` itself, check before you switch back to `voidauth/voidauth:latest`:

1. Does upstream's column have the same name (`picture`) and a compatible type (`text`/`string`, nullable)?
2. Does upstream's migration try to add the column again? If so, it fails on a DB that already has it.
   Before switching, run this fork's `down()` (or `ALTER TABLE "user" DROP COLUMN picture;`) and delete
   the `knex_migrations` row. The stored URLs are lost; export them first if needed.
3. Switching back without upstream support leaves an unused extra column, which does no harm.
   knex will complain about the unknown migration in `knex_migrations`, though, so remove that row.

## Building your own image (e.g. for a NAS)

- The final stage of the `Dockerfile` uses `dhi.io/node:24-alpine` (Docker Hardened Images), which
  **requires a login**: run `docker login dhi.io` before building, or temporarily switch the `serve`
  stage locally to `node:24-alpine`.
- Build: `docker build -t <registry>/voidauth:picture .`
- Before the first start with the fork image, **back up the DB** (e.g. `pg_dump`), because the
  migration changes the schema.
