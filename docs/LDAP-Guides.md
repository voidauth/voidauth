# LDAP Client Guides

## LDAP DN Environment Variable Defaults

| Name | Default |
| :------ | :-- |
| LDAP_PORT | `3890` |
| LDAP_BASE_DN | `dc=voidauth` |
| LDAP_BIND_DN | `cn=ldap_bind,dc=voidauth` |
| LDAP_BIND_PASSWORD | |

## LDAP Clients

Most clients should use these values. Values with a default (ex. `LDAP_BASE_DN: dc=voidauth`) should be replaced if the value has been changed:

| Client Setting | Value |
| :------ | :-- |
| URL | `ldap://voidauth:3890` or `ldaps://voidauth:3890` |
| Base DN | `dc=voidauth` |
| Bind DN | `cn=ldap_bind,dc=voidauth` |
| Bind Password | `${LDAP_BIND_PASSWORD}` |
| User Base DN | `ou=people,dc=voidauth` |
| Group Base DN | `ou=groups,dc=voidauth` |
| Login Filter | `(&(objectClass=inetOrgPerson)(mail=?))` or `(&(objectClass=inetOrgPerson)(uid=?))` |
| Group Filter | `(&(objectClass=groupOfNames)(member=?))` |
| Email Attribute | `mail` |
| Username Attribute | `uid` |
| Group Attribute | `memberOf` |

For services that support LDAP bind authentication, enable bind authentication and do not configure password-hash comparison. VoidAuth does not expose `userPassword` hashes over LDAP, and will not be compatible with clients that require it.

In the guides below, there may be omitted options when those options are not supported or are not required to be set. Default values (ex. `LDAP_BASE_DN: dc=voidauth`) are listed below, if they have been changed they should be replaced with their changed value.

> [!NOTE]
> The guides below are maintained by the community and may not always be accurate or current. If you notice any inaccuracies or have suggestions for improvements, please contribute those changes by submitting a pull request on the GitHub repository [here](https://github.com/voidauth/voidauth).

<br>

## <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/jellyfin.svg" width="28" /> Jellyfin

Install the `LDAP Authentication` Plugin from the Jellyfin Web Interface. Navigate to **Dashboard** > **Plugins** > **Catalog** > **LDAP Authentication** and click **Install**. Afterwards restart the Jellyfin server.

After the Jellyfin service has been restarted, navigate to **Dashboard** > **Plugins** > **My Plugs** > **LDAP-Auth** and fill out the form as directed below:

### LDAP Server Settings

#### LDAP Server

Use an address that is reachable by the Jellyfin service. If running Jellyfin in a compose file alongside VoidAuth, this will be the name of the VoidAuth service

```
voidauth
```

#### LDAP Port

```
3890
```

#### LDAP Bind User

```
cn=ldap_bind,dc=voidauth
```

#### LDAP Bind User Password

This must be set to the value of the VoidAuth environment variable `LDAP_BIND_PASSWORD`

#### LDAP Base DN for searches

```
dc=voidauth
``` 

### LDAP User Settings

#### LDAP Search Filter

To get only users with a specific group (ex. `jellyfin_user`), use filter:

```
(memberOf=cn=jellyfin_user,ou=groups,dc=voidauth)
```

To get all users, use filter:

```
(objectClass=inetOrgPerson)
```

#### LDAP Search Attributes

```
uid, mail
```

#### LDAP Uid Attribute

```
uid
```

#### LDAP Username Attribute

```
uid
```

#### LDAP Admin Filter

If you want to map a group in VoidAuth to admins in Jellyfin, use a filter like:

```
(memberOf=cn=jellyfin_admins,ou=groups,dc=voidauth)
```

#### Enable User Creation

✅ Check this checkbox

<br>
