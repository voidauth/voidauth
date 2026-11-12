# Migrating From Authentik

> [!WARNING]
> Check your Authentik version before you export. Authentik 2026.8.5 and older store the password hash in `authentik_core_user.password`. Since commit `23d587799f` on `main` (2026-11-02), the first release after 2026.8.5, the hash is stored in `authentik_stages_password_passworddevice.password`. The old column is kept but is never updated again. Running the query below on a newer Authentik imports a stale hash, so a password a user has already changed would work again. For a release after 2026.8.5, use the changed query in [Newer Authentik](#newer-authentik).

This page moves users from Authentik to VoidAuth with their existing passwords. The import command is described in [Import Users](CLI-Commands.md#import-users).

## Before You Start

- Update every VoidAuth instance to the same version before importing. An older instance cannot read the imported hashes.
- Run the import with the same image version as your server. A newer CLI would migrate the live database.
- Treat the export as a secret. It holds every password hash. Pipe it rather than copying it, restrict permissions on any file you do write, delete it when the import is done, and never commit it.

## Export From Authentik

Save the query below as `query.sql`, then run the export with `umask 077`, so the file is only readable by you:

```bash
umask 077
docker compose exec -T postgresql psql -U authentik -d authentik -tA < query.sql > users.json
```

The service name `postgresql`, the user `authentik` and the database `authentik` are examples. Adjust them for your install.

The query, for Authentik 2026.8.5 and older, reading `authentik_core_user.password`:

```sql
SELECT coalesce(json_agg(json_build_object(
  'username', u.username,
  'email', nullif(u.email, ''),
  'name', nullif(u.name, ''),
  'passwordHash', CASE WHEN u.password = '' OR u.password LIKE '!%' THEN NULL ELSE u.password END,
  'emailVerified', false,
  'mfaRequired', EXISTS (SELECT 1 FROM authentik_stages_authenticator_totp_totpdevice d WHERE d.user_id = u.id AND d.confirmed)
    OR EXISTS (SELECT 1 FROM authentik_stages_authenticator_webauthn_webauthndevice d WHERE d.user_id = u.id AND d.confirmed)
    OR EXISTS (SELECT 1 FROM authentik_stages_authenticator_duo_duodevice d WHERE d.user_id = u.id AND d.confirmed)
    OR EXISTS (SELECT 1 FROM authentik_stages_authenticator_sms_smsdevice d WHERE d.user_id = u.id AND d.confirmed)
    OR EXISTS (SELECT 1 FROM authentik_stages_authenticator_email_emaildevice d WHERE d.user_id = u.id AND d.confirmed)
)), '[]')
FROM authentik_core_user u
WHERE u.type IN ('internal', 'external') AND u.is_active AND u.username <> 'AnonymousUser';
```

The query exports active internal and external users only. Disabled users are left out on purpose: VoidAuth has no disabled state outside approval and expiry, so importing one would reactivate it. Service accounts are left out too, recreate them if you need them. Unusable and empty passwords export as `null`.

### Newer Authentik

For a release after 2026.8.5, use the same query with two changes.

Replace the `passwordHash` line with:

```sql
  'passwordHash', CASE WHEN p.locked_at IS NULL THEN p.password END,
```

Add this before the `WHERE` line:

```sql
  LEFT JOIN authentik_stages_password_passworddevice p ON p.user_id = u.id
```

This changed query has not been run against a released version of Authentik, so check the table and column names on your instance first.

## Fix Entries That Will Be Refused

The import refuses the whole file if one entry is invalid, so fix the export before importing. The full field rules are in [Import Users](CLI-Commands.md#import-users).

- Usernames such as `bob.smith`, `carol@example.com`, or any username over 32 characters are refused. Edit the file. The user can still log in with their email address, as login matches either the username or the email.
- Two users with the same email address, in any letter case, are refused. Authentik does not require unique email addresses, so set one to `null` or correct it.
- A name over 64 characters is refused. Shorten it.
- `auth_admin` is reserved in any case.
- `emailVerified` set to `true` with no email is refused.

## Import

Import with the same image version as the server, and preferably while the server is stopped or quiet:

```bash
docker compose run --rm -T voidauth user import /dev/stdin < users.json
```

If the import fails at startup with `MigrationLocked ... database is locked`, nothing was written. Retry when the database is idle.

## What Changes For Users And Apps

Users keep their password. After that, they may need to enrol MFA, verify their email address, and re-link or give consent in apps. Weak passwords carry over, as password strength rules apply only when a password is set.

### MFA

MFA does not transfer. TOTP and passkeys cannot be moved.

The query sets `mfaRequired` for anyone with a confirmed device. Such a user logs in with their password, is sent to the MFA page, enrols TOTP, and continues.

### LDAP And Basic Auth

Users with `mfaRequired`, and members of MFA groups, cannot use LDAP bind or ProxyAuth basic auth, as those only offer a password. An LDAP bind returns result 49 and basic auth returns 302.

### Groups

Groups do not transfer. Only the groups marked to auto-assign are applied. Assign groups after the import. Until then, users may lose access to apps that rely on group membership.

### Sub And entryUUID

> [!IMPORTANT]
> The OIDC `sub` claim and the LDAP `entryUUID` value change, as they are the new VoidAuth user id. Apps that key on either see a new user and may need to be re-linked.

### emailVerified

The query exports every user with `emailVerified` false. Authentik does not record whether an address was verified, and its users may have set their own email address.

VoidAuth passes the value to apps as `email_verified`, and many apps link accounts by verified email. Importing `true` would vouch for addresses nobody checked, which can enable account takeover in those apps. Set `true` only for addresses you have checked yourself.

If email verification is enabled in VoidAuth, users with `false` must verify at their next login.

## Forcing Resets Later

Inactive users keep the old hash until they log in. To count the users still on a PBKDF2 hash:

```sql
select count(*) from "user" where "passwordHash" like '%pbkdf2%';
```

Then reset one user at a time:

```bash
voidauth user password-reset <username>
```

## Rollback

An older VoidAuth version cannot read these hashes, so those users cannot log in until you upgrade again. That is why every instance is updated before the import.

`voidauth migrate` carries hashes that have not yet been upgraded to the other database, and those users can still log in afterwards, in both directions.
