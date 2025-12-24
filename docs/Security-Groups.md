# Security Groups

Security Groups are created from the admin Groups page, users can be added to groups from either the Group Update or User Update pages.

> [!IMPORTANT]
> VoidAuth users who are members of the `auth_admins` group become administrators in VoidAuth. This is how you should promote your own user after using the initial admin account to create/invite yourself.

> [!TIP]
> Users with the `auth_admins` group will not be denied access to any resource, regardless of other security group restrictions.

<p align=center>
<img width="336" alt="image" src="/public/screenshots/91429974-7e2c-4c3a-80a4-ad25e5ea6416.png" />
</p>

Security Groups are used in both OIDC Clients and ProxyAuth Domains.

### ProxyAuth
Security Groups are used in ProxyAuth Domains for:
* ProxyAuth Domain authorization
* Trusted Header SSO, a users groups are added to the 'Remote-Groups' header

For information on ProxyAuth setup visit the [ProxyAuth Setup Guide](ProxyAuth-and-Trusted-Header-SSO-Setup.md).

### OIDC
Security Groups are used in OIDC Clients for:
* OIDC Client authorization
* Sent with tokens when the OIDC Client requests the 'groups' scope. The OIDC Client may use the groups for its own authorization, ex. [Jellyfin SSO Plugin](https://github.com/9p4/jellyfin-plugin-sso)

For information on OIDC setup visit the [OIDC Setup Guide](OIDC-Setup.md).
