# OIDC Guides

In the guides below, there may be omitted options when those options are set to the default value.

> [!TIP]
> Placeholders are used for common settings, like `your-client-id`, `your-client-secret`, `https://app-name.example.com`, `${APP_URL}` and `Copy from VoidAuth OIDC Info`. OIDC (Endpoint) Info can be found in the dropdown tab on the admin OIDC and OIDC Client Create pages.

> [!CAUTION]
> Client IDs **must** be unique between clients. Client Secrets **must** be long and randomly generated. VoidAuth provides the ability to generate the Client Secret field on the OIDC Client page and to copy it to the clipboard for use in the OIDC Client application. Client Secrets are encrypted on disk.

## <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/beszel.svg" width="28" /> Beszel

Follow the [OAuth Guide](https://www.beszel.dev/guide/oauth) in the Beszel Docs and select `OpenID Connect (oidc)` from the **Add Provider** dropdown. Fill out the config as follows:
```
Client ID: your-client-id
Client Secret: your-client-secret
Auth URL: Copy from OIDC Info in VoidAuth (Auth Endpoint)
Token URL: Copy from OIDC Info in VoidAuth (Token Endpoint)
Fetch user info from: User info URL
User info URL: Copy from OIDC Info in VoidAuth (UserInfo Endpoint)
```

In VoidAuth:
```
Client ID: your-client-id
Client Secret: your-client-secret
Redirect URLs: https://beszel.example.com/api/oauth2-redirect
Token Endpoint Auth Method: client_secret_basic
```

## <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/immich.svg" width="28" /> Immich
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
> Because Immich requires a custom scheme for the mobile app (app.immich:///) you must set the **Application Type** in VoidAuth to 'native'. This has the side-effect that immich must be on a secure `https://` url, since insecure `http://` urls are not supported by the 'native' Application Type.

## <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/jellyfin.svg" width="28" /> Jellyfin
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

## <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/mastodon.svg" width="28" /> Mastodon

Mastodon OIDC Setup Environment Variables:

```
OIDC_ENABLED: true
OIDC_DISCOVERY: true
OIDC_ISSUER: ${APP_URL}
OIDC_DISPLAY_NAME: VoidAuth
OIDC_CLIENT_ID: your-client-id
OIDC_CLIENT_SECRET: your-client-secret
OIDC_SCOPE: openid,profile,email
OIDC_UID_FIELD: preferred_username
OIDC_REDIRECT_URI: https://mastodon.example.com/auth/auth/openid_connect/callback
OIDC_SECURITY_ASSUME_EMAIL_IS_VERIFIED: true
# Optional:
# ALLOW_UNSAFE_AUTH_PROVIDER_REATTACH: true
```

In VoidAuth:

```
Client ID: your-client-id
Client Secret: your-client-secret
Redirect URLs: https://mastodon.example.com/auth/auth/openid_connect/callback
Token Endpoint Auth Method: client_secret_basic
```

## <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/open-webui.svg" width="28" /> Open WebUI

In the following example only users in VoidAuth with the group `users` or `admins` will be able to log in. Adjust these group names as needed.

Open WebUI OIDC Setup Environment Variables:

```
WEBUI_URL: https://openwebui.example.com
ENABLE_OAUTH_SIGNUP: true
OAUTH_MERGE_ACCOUNTS_BY_EMAIL: true
OAUTH_CLIENT_ID: your-client-id
OAUTH_CLIENT_SECRET: your-client-secret
OPENID_PROVIDER_URL: Copy from OIDC Info in VoidAuth (Well-Known Endpoint)
OAUTH_PROVIDER_NAME: VoidAuth
OAUTH_SCOPES: openid profile groups email
ENABLE_OAUTH_ROLE_MANAGEMENT: true
OAUTH_ROLES_CLAIM: groups
OAUTH_ALLOWED_ROLES: users,admins
OAUTH_ADMIN_ROLES: admins
...
```

In VoidAuth:

```
Client ID: your-client-id
Client Secret: your-client-secret
Redirect URLs: https://openwebui.example.com/oauth/oidc/callback
Token Endpoint Auth Method: client_secret_basic
```

## <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/portainer.svg" width="28" /> Portainer
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