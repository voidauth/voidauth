# LDAP Server

> [!WARNING]
> LDAP Server functionality is experimental.

VoidAuth can expose a read-only LDAP directory for services that need LDAP for authentication, user lookup, or group lookup.

The LDAP directory is backed by VoidAuth users and security groups:

* Users are exposed under `ou=people,{LDAP_BASE_DN}`
* Groups are exposed under `ou=groups,{LDAP_BASE_DN}`
* User entries use `inetOrgPerson`
* Group entries use `groupOfNames`, `groupOfUniqueNames`
* LDAP bind authentication uses the user's VoidAuth password

> [!IMPORTANT]
> LDAP support is read-only. Users, passwords, and groups must still be managed in VoidAuth.

## Configuration

LDAP is disabled by default. To enable it, add the LDAP environment variables to the VoidAuth service. See the available configuration environment variables on the [Getting Started](Getting-Started.md#ldap-settings) page.

> [!WARNING]
> Plain LDAP sends bind passwords over the network without encryption. Use this only on a trusted private network, or enable LDAPS with `LDAP_TLS_CERT_FILE` and `LDAP_TLS_KEY_FILE`.

## Directory Layout

If `{LDAP_BASE_DN}` is `dc=voidauth` a user named `alice` is exposed as:

```text
uid=alice,ou=people,dc=voidauth
```

A group named `admins` is exposed as:

```text
cn=admins,ou=groups,dc=voidauth
```

A filter for users in the `admins` groups:

```text
(memberOf=cn=admins,ou=groups,dc=voidauth)
```

Common user attributes:

| Attribute | Value |
| :------ | :-- |
| uid | VoidAuth username |
| cn | VoidAuth display name, or username |
| entryUUID | VoidAuth user id |
| displayName | VoidAuth display name, or username |
| mail | VoidAuth email address |
| entryUUID | VoidAuth user id |
| memberOf | Group DNs for the user's VoidAuth security groups |
| isMemberOf | Same values as `memberOf` |

Common group attributes:

| Attribute | Value |
| :------ | :-- |
| cn | VoidAuth security group name |
| entryUUID | VoidAuth group id |
| member | User DNs for users in the group |
| uniqueMember | Same values as `member` |
| memberUid | Usernames for users in the group |

Users that are unapproved, expired, or missing required email verification are not returned in LDAP search results (unless they are in the `auth_admins` group). Users can bind only if they have a VoidAuth password and can log in with a password alone. If a user or one of their groups requires MFA, LDAP simple bind is denied because LDAP simple bind cannot complete a second factor.

## Client Setup

### LDAP DN Environment Variable Defaults

| Name | Default |
| :------ | :-- |
| LDAP_BASE_DN | `dc=voidauth` |
| LDAP_BIND_DN | `cn=ldap_bind,dc=voidauth` |
| LDAP_BIND_PASSWORD | |

Most clients should use these values, properties that should be filled in with the default or set values are wrapped in curly braces ex. `{LDAP_BIND_DN}`:

| Client Setting | Value |
| :------ | :-- |
| URL | `ldap://voidauth:3890` or `ldaps://voidauth:3890` |
| Base DN | `{LDAP_BASE_DN}` |
| Bind DN | `{LDAP_BIND_DN}` |
| Bind Password | `{LDAP_BIND_PASSWORD}` |
| User Base DN | `ou=people,{LDAP_BASE_DN}` |
| Group Base DN | `ou=groups,{LDAP_BASE_DN}` |
| Login Filter | `(&(objectClass=inetOrgPerson)(mail=?))` or `(&(objectClass=inetOrgPerson)(uid=?))` |
| Group Filter | `(&(objectClass=groupOfNames)(member=?))` |
| Email Attribute | `mail` |
| Username Attribute | `uid` |
| Group Attribute | `memberOf` |

For services that support LDAP bind authentication, enable bind authentication and do not configure password-hash comparison. VoidAuth does not expose `userPassword` hashes over LDAP, and will not be compatible with clients that require it.
