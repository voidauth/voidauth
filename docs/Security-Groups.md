# Security Groups

Security Groups are created from the admin Groups page, users can be added to groups from either the Group Update or User Update pages.

> [!TIP]
> VoidAuth users who are members of the 'auth_admins' group become administrators in VoidAuth. This is how you should promote your own user after using the initial admin account to create/invite yourself.

<img width="336" alt="image" src="/public/screenshots/91429974-7e2c-4c3a-80a4-ad25e5ea6416.png" />

Security Groups are used in both OIDC and ProxyAuth.

### ProxyAuth
Security Groups are used in ProxyAuth for:
* ProxyAuth Domain authorization
* Trusted Header SSO, a users groups are added to the 'Remote-Groups' header

### OIDC
Security Groups are used by OIDC when the OIDC Client requests the 'groups' scope. The OIDC Client may use the groups for authorization itself, ex. [Jellyfin SSO Plugin](https://github.com/9p4/jellyfin-plugin-sso).