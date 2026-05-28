# LDAP Server

> [!WARNING]
> LDAP Server functionality is experimental.

VoidAuth can expose a read-only LDAP directory for services that need LDAP for authentication, user lookup, or group lookup.

The LDAP directory is backed by VoidAuth users and security groups:

* Users are exposed under `ou=people,{LDAP_BASE_DN}`
* Groups are exposed under `ou=groups,{LDAP_BASE_DN}`
* User entries are in object classes `person`, `inetOrgPerson`
* Group entries are in object classes `groupOfNames`, `groupOfUniqueNames`
* LDAP bind authentication uses the user's VoidAuth password

> [!IMPORTANT]
> LDAP support is read-only. Users, passwords, and groups must still be managed in VoidAuth.

## Configuration

LDAP is disabled by default. To enable it, add the LDAP environment variables to the VoidAuth service. See the available configuration environment variables on the [Getting Started](Getting-Started.md#ldap-settings) page.

> [!WARNING]
> Plain LDAP sends bind passwords over the network without encryption. Use this only on a trusted private network, or enable LDAPS with `LDAP_TLS_CERT_FILE` and `LDAP_TLS_KEY_FILE`.

## Directory Layout

If `{LDAP_BASE_DN}` is `dc=voidauth` (the default value) a user named `alice` is exposed as:

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
| cn | VoidAuth username |
| entryUUID | VoidAuth user id |
| displayName | VoidAuth display name, or username |
| mail | VoidAuth email address |
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

Users that are unapproved, expired, or missing required email verification are not returned in LDAP search results (unless they are in the `auth_admins` group). Users can bind only if they have a VoidAuth password and can log in with a password alone. If a user would require MFA to sign in, LDAP simple bind is denied because LDAP simple bind cannot complete a second factor.

## Client Setup

For LDAP Client setup examples, see the [LDAP Client Guides](LDAP-Guides.md) page.
