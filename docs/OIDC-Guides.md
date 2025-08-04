# OIDC Guides

In the guides below, there may be omitted options when those options are set to the default value.

> [!TIP]
> Placeholders are used for common settings, like **your-client-id**, **your-client-secret**, **example.com**, and **Copy from VoidAuth OIDC Info**. OIDC (Endpoint) Info can be found in the dropdown tab on the admin OIDC and OIDC Client Create pages.

> [!CAUTION]
> Client IDs **must** be unique between clients. Client Secrets **must** be long and randomly generated. VoidAuth provides options to generate the Client Secret field and to copy it to the clipboard for use in the OIDC Client application. Client Secrets are encrypted on disk.

## Immich
In Immich:
**Administration** > **Settings** > **OAuth Settings**
```
Issuer URL: Copy from OIDC Info in VoidAuth (Well-Known Endpoint)
Client ID: your-client-id
Client Secret: your-client-secret
Scope: openid profile email
```

In VoidAuth:
```
Client ID: your-client-id
Client Secret: your-client-secret
Redirect URLs:
  - https://immich.example.com/auth/login
  - https://immich.example.com/user-settings
  - app.immich:///oauth-callback
Application Type: native
Token Endpoint Auth Method: client_secret_post
```
> [!NOTE]
> Because Immich requires a custom scheme for it's mobile app (app.immich:///) you must set the **Application Type** in VoidAuth to 'native'. This has the side-effect that immich must be on a secure https:// url, since insecure http:// is not supported by the 'native' Application Type.

## Jellyfin
In Jellyfin:
1. Follow the instructions in the [Jellyfin SSO Plugin](https://github.com/9p4/jellyfin-plugin-sso) repository to install it.
    1. Navigate in Jellyfin to **Dashboard** > **Plugins** > **Catalog** > **Repositories**/**Gear Icon**
    2. Add a repository, (+) button
        * Name: Jellyfin SSO
        * URL: https://raw.githubusercontent.com/9p4/jellyfin-plugin-sso/manifest-release/manifest.json
    3. Save
    4. From **Dashboard** > **Plugins** > **Catalog** Install **SSO-Auth**, Restart Jellyfin
2. Navigate to **Dashboard** > **Plugins** > **My Plugins** > **SSO-Auth**
3. Fill out the OID Provider form as follows and Save:
```
Name: VoidAuth
OID Endpoint: Copy from VoidAuth OIDC Info (OIDC Endpoint)
OpenID Client ID: your-client-id
OID Secret: your-client-secret
Enabled: Yes
Enable Authorization by Plugin: Yes
Enable All Folders: Yes
Roles: your-user-role
Admin Roles: your-admin-role
Role Claim: groups
Request Additional Scopes: groups
Set default username claim: preferred_username
Scheme Override: https
```
4. Follow the instructions on the [Jellyfin SSO Plugin](https://github.com/9p4/jellyfin-plugin-sso) repository for how to make an SSO Login button on the Jellyfin Login page.

In VoidAuth:
```
Client ID: your-client-id
Client Secret: your-client-secret
Redirect URLs: https://jellyfin.example.com/sso/OID/redirect/VoidAuth
Token Endpoint Auth Method: client_secret_post
```

## Portainer
In Portainer:
**Settings** > **Authenticate**
1. Select **OAuth** from the Authentication Methods
2. Select **Custom** OAuth Provider
3. Fill the OAuth Configuration form as follows:
```
Client ID: your-client-id
Client secret: your-client-secret
Authorization URL: Copy from OIDC Info in VoidAuth (Authorization Endpoint)
Access token URL: Copy from OIDC Info in VoidAuth (Token Endpoint)
Resource URL: Copy from OIDC Info in VoidAuth (UserInfo Endpoint)
Redirect URL: https://portainer.example.com
User identifier: preferred_username
Scopes: openid profile groups email
Auth Style: In Params
```
> [!Note]
> Scopes are seperated by spaces, **not** by commas

In VoidAuth: Create OIDC Client
```
Client ID: your-client-id
Client Secret: your-client-secret
Redirect URLs: https://portainer.example.com
Token Endpoint Auth Method: client_secret_post
```
Screenshot(s):
<img width="1400" src="/public/screenshots/f7cf9712-4259-43ce-bde1-fbe22a447763.png" />