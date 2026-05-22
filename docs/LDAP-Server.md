# LDAP Server

VoidAuth can expose a read-only LDAP directory for services that need LDAP for authentication, user lookup, or group lookup.

The LDAP directory is backed by VoidAuth users and security groups:

* Users are exposed under `ou=people,{LDAP_BASE_DN}`
* Groups are exposed under `ou=groups,{LDAP_BASE_DN}`
* User entries use `inetOrgPerson` and `posixAccount`
* Group entries use `groupOfNames`, `groupOfUniqueNames`, and `posixGroup`
* LDAP bind authentication uses the user's VoidAuth password

> [!IMPORTANT]
> LDAP support is read-only. Users, passwords, and groups must still be managed in VoidAuth.

## Configuration

LDAP is disabled by default. To enable it, add the LDAP environment variables to the VoidAuth service:

```yaml
services:
  voidauth:
    image: voidauth/voidauth:latest
    ports:
      - "3000:3000"
      - "3890:3890"
    environment:
      APP_URL: https://auth.example.com
      STORAGE_KEY: ${STORAGE_KEY}
      DB_HOST: voidauth-db
      DB_PASSWORD: ${DB_PASSWORD}

      LDAP_ENABLED: "true"
      LDAP_PORT: 3890
      LDAP_BASE_DN: dc=example,dc=com
      LDAP_BIND_DN: cn=ldap_bind,dc=example,dc=com
      LDAP_BIND_PASSWORD: ${LDAP_BIND_PASSWORD}
```

### Environment Variables

| Name | Default | Description |
| :------ | :-- | :-------- |
| LDAP_ENABLED | `false` | Enables the LDAP server. |
| LDAP_HOST | `0.0.0.0` | Address the LDAP server listens on. |
| LDAP_PORT | `3890` | Port the LDAP server listens on. |
| LDAP_BASE_DN | `dc=voidauth` | Base distinguished name for the directory. |
| LDAP_USERS_OU | `people` | Organizational unit used for user entries. |
| LDAP_GROUPS_OU | `groups` | Organizational unit used for group entries. |
| LDAP_BIND_DN | `cn=ldap_bind,dc=voidauth` | Service account DN that LDAP clients can bind with before searching. |
| LDAP_BIND_PASSWORD | | Password for `LDAP_BIND_DN`. Recommended for most clients. |
| LDAP_ALLOW_ANONYMOUS_SEARCH | `false` | Allows anonymous LDAP clients to search the directory. |
| LDAP_TLS_CERT_FILE | | Path to a PEM certificate file. If set, `LDAP_TLS_KEY_FILE` must also be set and VoidAuth listens with LDAPS. |
| LDAP_TLS_KEY_FILE | | Path to the PEM private key file for `LDAP_TLS_CERT_FILE`. |

> [!WARNING]
> Plain LDAP sends bind passwords over the network without encryption. Use this only on a trusted private network, or enable LDAPS with `LDAP_TLS_CERT_FILE` and `LDAP_TLS_KEY_FILE`.

## Directory Layout

If `LDAP_BASE_DN` is `dc=example,dc=com`, a user named `alice` is exposed as:

```text
uid=alice,ou=people,dc=example,dc=com
```

A group named `admins` is exposed as:

```text
cn=admins,ou=groups,dc=example,dc=com
```

Common user attributes:

| Attribute | Value |
| :------ | :-- |
| uid | VoidAuth username |
| cn | VoidAuth display name, or username |
| displayName | VoidAuth display name, or username |
| mail | VoidAuth email address |
| entryUUID | VoidAuth user id |
| memberOf | Group DNs for the user's VoidAuth security groups |

Common group attributes:

| Attribute | Value |
| :------ | :-- |
| cn | VoidAuth security group name |
| entryUUID | VoidAuth group id |
| member | User DNs for users in the group |
| uniqueMember | Same values as `member` |
| memberUid | Usernames for users in the group |

Users that are unapproved, expired, or missing required email verification are not returned in LDAP search results. Users can bind only if they have a VoidAuth password and can log in with a password alone. If a user or one of their groups requires MFA, LDAP simple bind is denied because LDAP simple bind cannot complete a second factor.

## Client Setup

Most clients should use these values:

| Client Setting | Value |
| :------ | :-- |
| URL | `ldap://voidauth:3890` or `ldaps://voidauth:3890` |
| Base DN | `LDAP_BASE_DN` |
| Bind DN | `LDAP_BIND_DN` |
| Bind Password | `LDAP_BIND_PASSWORD` |
| User Base DN | `ou=people,{LDAP_BASE_DN}` |
| Group Base DN | `ou=groups,{LDAP_BASE_DN}` |
| Login Filter | `(&(objectClass=inetOrgPerson)(mail=?))` or `(&(objectClass=inetOrgPerson)(uid=?))` |
| Group Filter | `(&(objectClass=groupOfNames)(member=?))` |
| Email Attribute | `mail` |
| Username Attribute | `uid` |
| Group Attribute | `memberOf` |

For services such as Stalwart that support LDAP bind authentication, enable bind authentication and do not configure password-hash comparison. VoidAuth does not expose `userPassword` hashes over LDAP.
