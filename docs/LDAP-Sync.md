# LDAP Sync

## What It Does

LDAP Sync pulls users and groups from an external LDAP directory (OpenLDAP,
389 Directory Server, Active Directory, etc.) into VoidAuth automatically on a
configurable interval.  Once synced, those users authenticate against the LDAP
directory — VoidAuth never stores or sees their LDAP password.

**Sync runs every `LDAP_SYNC_TIME` seconds (default: 3600, one hour).**  
It also fires once at server startup so the first sync is immediate.

---

## How It Works

### Sync Cycle (every `LDAP_SYNC_TIME` seconds)

| Step | What happens |
|---|---|
| **1. Bind** | Connects to the remote LDAP server and authenticates with the configured service account (`LDAP_SYNC_BIND_DN` + `LDAP_SYNC_BIND_PASSWORD`). |
| **2. Fetch users** | Searches for entries matching `LDAP_SYNC_USER_SEARCH_FILTER` under `LDAP_SYNC_BASE_DN`.  Pulls configured attribute mappings (username, email, first/last name) plus `memberOf` for admin-group detection. |
| **3. Fetch groups** | Searches for entries matching `LDAP_SYNC_GROUPS_SEARCH_FILTER` under `LDAP_SYNC_BASE_DN`.  Pulls group name, unique identifier, and member DNs. |
| **4. Sync users** | For each LDAP user: creates a new VoidAuth user if not found, links an existing user by DN or username, or updates profile fields (username, email, name) for already-linked accounts.  New users are created with `approved=true` and `emailVerified=true`. |
| **5. Sync groups** | For each LDAP group: creates or updates the group in VoidAuth, resolves member DNs to VoidAuth user IDs, and adjusts `user_group` memberships (add new members, remove stale ones). |
| **6. Handle removals** | Finds VoidAuth users with `ldapSource='ldap'` that were *not* in the current LDAP result set and either disables them or deletes them, per `LDAP_SYNC_KEEP_DISABLED_USERS`. |
| **7. Admin promotion** | If `LDAP_SYNC_ADMIN_GROUP_NAME` is set, any LDAP user whose `memberOf` attribute includes a group with a matching CN is added to VoidAuth's built-in `auth_admins` group. |

### Login Flow for Synced Users

1. User submits username + password on the VoidAuth login form.
2. `checkPasswordHash()` looks up the user and sees `ldapSource = 'ldap'` with a non-empty `ldapExternalId` (the full LDAP DN).
3. Instead of checking an argon2 hash, VoidAuth opens a fresh connection to the LDAP server and performs a **simple bind** (`bind(userDN, password)`).
4. If the bind succeeds → authenticated.  If it fails → credential rejected.

**Implications**:
- LDAP password changes take effect immediately — no sync delay.
- VoidAuth never stores the user's LDAP password.
- Password reset in VoidAuth won't work for LDAP users; they must change their password in LDAP.

### User Removal Behaviour

When a user is no longer returned by the LDAP search (they were disabled or
deleted in the directory):

| `LDAP_SYNC_KEEP_DISABLED_USERS` | Behaviour |
|---|---|
| **`true`** (keep them) | User is kept but set `approved=false` and `expiresAt=now`.  They cannot log in but their data (groups, sessions, consents) is preserved. |
| **`false`** (don't keep) | User is **deleted** from VoidAuth entirely (cascade: sessions, consents, OIDC payloads, passkeys, TOTP are all removed). |

---

## Environment Variables

### Required (when `LDAP_SYNC_ENABLED=true`)

| Variable | Description | Example |
|---|---|---|
| `LDAP_SYNC_ENABLED` | Master on/off toggle.  Must be `true` for any sync to occur. | `true` |
| `LDAP_SYNC_URL` | Full LDAP(S) URL to the remote directory.  Use `ldap://` for plain, `ldaps://` for TLS. | `ldap://ldap.example.com:389` |
| `LDAP_SYNC_BIND_DN` | DN of the service account used to bind and search the directory. | `uid=svc_voidauth,ou=people,dc=example,dc=com` |
| `LDAP_SYNC_BIND_PASSWORD` | Password for the bind account above. | `s3cretP4ssw0rd` |
| `LDAP_SYNC_BASE_DN` | Subtree root under which users and groups are searched. | `dc=example,dc=com` |

### Interval

| Variable | Default | Description | Example |
|---|---|---|---|
| `LDAP_SYNC_TIME` | `3600` | Number of seconds between sync cycles. | `900` (every 15 min) |

### TLS

| Variable | Default | Description | Example |
|---|---|---|---|
| `LDAP_SYNC_SKIP_CERT_VERIFICATION` | `false` | Skip TLS certificate validation.  Only set to `true` for self-signed certs in dev. | `true` |

### Removed / Disabled Users

| Variable | Default | Description | Example |
|---|---|---|---|
| `LDAP_SYNC_KEEP_DISABLED_USERS` | `false` | `true` = keep user data but disable the account; `false` = delete the user. | `true` |

### Search Filters

| Variable | Default | Description | Example |
|---|---|---|---|
| `LDAP_SYNC_USER_SEARCH_FILTER` | — | LDAP filter for finding user entries.  Leave empty to use the directory's default behaviour. | `(objectClass=person)` |
| `LDAP_SYNC_GROUPS_SEARCH_FILTER` | — | LDAP filter for finding group entries. | `(objectClass=groupOfNames)` |

### Attribute Mapping — Users

These tell VoidAuth which LDAP attributes to read for each user property.
Defaults shown in the Description column; if your directory uses different
attribute names, override them explicitly.

| Variable | Description (default) | Example |
|---|---|---|
| `LDAP_SYNC_USERNAME_ATTRIBUTE` | LDAP attribute for the username (`uid`). | `sAMAccountName` |
| `LDAP_SYNC_USER_MAIL_ATTRIBUTE` | LDAP attribute for the email address (`mail`). | `mail` |
| `LDAP_SYNC_USER_FIRSTNAME_ATTRIBUTE` | LDAP attribute for the first / given name (`givenName`). | `givenName` |
| `LDAP_SYNC_USER_LASTNAME_ATTRIBUTE` | LDAP attribute for the last / family name (`sn`). | `sn` |

### Attribute Mapping — Groups

| Variable | Description (default) | Example |
|---|---|---|
| `LDAP_SYNC_GROUP_NAME_ATTRIBUTE` | LDAP attribute for the group name (`cn`). | `cn` |
| `LDAP_SYNC_GROUP_MEMBERS_ATTRIBUTE` | LDAP attribute listing group member DNs (`member`). | `uniqueMember` |
| `LDAP_SYNC_GROUP_UNIQUE_IDENTIFIER_ATTRIBUTE` | LDAP attribute used to detect existing groups across sync cycles. Falls back to the entry DN if unset or unavailable. | `entryUUID` |

### Admin Group Promotion

| Variable | Description | Example |
|---|---|---|
| `LDAP_SYNC_ADMIN_GROUP_NAME` | If set, any LDAP user whose `memberOf` contains a group with this CN is automatically added to VoidAuth's `auth_admins` group. | `void_admin_group` |

---

## Example Configurations

### Minimal — OpenLDAP

```
LDAP_SYNC_ENABLED=true
LDAP_SYNC_URL="ldap://openldap.example.com:389"
LDAP_SYNC_BIND_DN="uid=svc_voidauth,ou=people,dc=example,dc=com"
LDAP_SYNC_BIND_PASSWORD="s3cret"
LDAP_SYNC_BASE_DN="dc=example,dc=com"
LDAP_SYNC_USER_SEARCH_FILTER="(objectClass=person)"
LDAP_SYNC_GROUPS_SEARCH_FILTER="(objectClass=groupOfNames)"
LDAP_SYNC_TIME=900
```

### Active Directory (LDAPS)

```
LDAP_SYNC_ENABLED=true
LDAP_SYNC_URL="ldaps://dc01.ad.example.com:636"
LDAP_SYNC_BIND_DN="CN=SvcVoidAuth,OU=ServiceAccounts,DC=ad,DC=example,DC=com"
LDAP_SYNC_BIND_PASSWORD="s3cret"
LDAP_SYNC_BASE_DN="DC=ad,DC=example,DC=com"
LDAP_SYNC_USER_SEARCH_FILTER="(&(objectClass=user)(objectCategory=person))"
LDAP_SYNC_GROUPS_SEARCH_FILTER="(objectClass=group)"
LDAP_SYNC_USERNAME_ATTRIBUTE="sAMAccountName"
LDAP_SYNC_USER_MAIL_ATTRIBUTE="mail"
LDAP_SYNC_USER_FIRSTNAME_ATTRIBUTE="givenName"
LDAP_SYNC_USER_LASTNAME_ATTRIBUTE="sn"
LDAP_SYNC_GROUP_NAME_ATTRIBUTE="cn"
LDAP_SYNC_GROUP_MEMBERS_ATTRIBUTE="member"
LDAP_SYNC_SKIP_CERT_VERIFICATION=false
LDAP_SYNC_KEEP_DISABLED_USERS=true
LDAP_SYNC_ADMIN_GROUP_NAME="Domain Admins"
LDAP_SYNC_TIME=3600
```

### 389 Directory Server with Admin Promotion

```
LDAP_SYNC_ENABLED=true
LDAP_SYNC_URL="ldap://ds.example.com:389"
LDAP_SYNC_BIND_DN="uid=svc_voidauth,ou=people,dc=example,dc=com"
LDAP_SYNC_BIND_PASSWORD="s3cret"
LDAP_SYNC_BASE_DN="dc=example,dc=com"
LDAP_SYNC_USER_SEARCH_FILTER="(objectClass=person)"
LDAP_SYNC_GROUPS_SEARCH_FILTER="(objectClass=groupOfNames)"
LDAP_SYNC_ADMIN_GROUP_NAME="void_admin_group"
LDAP_SYNC_TIME=1800
```

### LLDAP

LLDAP is a lightweight self-hosted LDAP server commonly used with homelab
setups.  Its default schema differs slightly from OpenLDAP — notably groups use
the `groupOfUniqueNames` object class with `uniqueMember` for member DNs, and
the LDAP port is typically `3890`.

```
LDAP_SYNC_ENABLED=true
LDAP_SYNC_URL="ldap://lldap.example.com:3890"
LDAP_SYNC_BIND_DN="uid=admin,ou=people,dc=example,dc=com"
LDAP_SYNC_BIND_PASSWORD="admin_password"
LDAP_SYNC_BASE_DN="dc=example,dc=com"
LDAP_SYNC_USER_SEARCH_FILTER="(objectClass=person)"
LDAP_SYNC_GROUPS_SEARCH_FILTER="(objectClass=groupOfUniqueNames)"
LDAP_SYNC_USERNAME_ATTRIBUTE="uid"
LDAP_SYNC_USER_MAIL_ATTRIBUTE="mail"
LDAP_SYNC_USER_FIRSTNAME_ATTRIBUTE="givenName"
LDAP_SYNC_USER_LASTNAME_ATTRIBUTE="sn"
LDAP_SYNC_GROUP_NAME_ATTRIBUTE="cn"
LDAP_SYNC_GROUP_MEMBERS_ATTRIBUTE="uniqueMember"
LDAP_SYNC_ADMIN_GROUP_NAME="lldap_admin"
LDAP_SYNC_TIME=600
```

> **LLDAP notes:**
> - LLDAP uses `groupOfUniqueNames` as its group object class and `uniqueMember`
>   as the member attribute — make sure `LDAP_SYNC_GROUPS_SEARCH_FILTER` and
>   `LDAP_SYNC_GROUP_MEMBERS_ATTRIBUTE` are set as above.
> - The bind account can be the LLDAP admin user (`uid=admin,ou=people,…`)
>   or a dedicated read-only service account created in the LLDAP UI.
> - LLDAP runs LDAP on port **3890** by default (not the standard 389), but
>   this is configurable via its `LLDAP_LDAP_PORT` env var.
> - If you are not exposing user surnames (`sn`) in LLDAP, omit
>   `LDAP_SYNC_USER_LASTNAME_ATTRIBUTE` and the first name alone will be used
>   as the VoidAuth display name.

---


## Debugging

Set `ENABLE_DEBUG=true` in your `.env` to see detailed log output:

```
LDAP sync: bound successfully
LDAP sync completed: 42 users, 5 groups synced
Attempting LDAP bind auth for user: jdoe, DN: uid=jdoe,ou=people,dc=example,dc=com
LDAP bind auth succeeded for user: jdoe
```

Error cases:
- **`LDAP bind failed: invalid credentials for DN: …`** — wrong password or DN mismatch.
- **`LDAP bind error for DN: …`** (with stack trace) — connection refused, DNS failure, TLS error.
- **`LDAP bind skipped: stored externalId is not a valid DN: "…"`** — the user's `ldapExternalId` is stale (was synced before the DN-as-externalId fix).  A re-sync will correct it.
- **`LDAP sync failed`** — the entire sync cycle failed (unreachable server, bad credentials, etc.).
