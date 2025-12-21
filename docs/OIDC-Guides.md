# OIDC Guides

In the guides below, there may be omitted options when those options are set to the default value.

> [!TIP]
> Placeholders are used for common settings, like `your-client-id`, `your-client-secret`, `your-admin-role`, `https://app-name.example.com`, and `Copy from VoidAuth OIDC Info`. OIDC (Endpoint) Info can be found in the dropdown tab on the admin OIDC and OIDC Client Create pages, and is the recommended source of OIDC related Endpoint URLs.

> [!CAUTION]
> Client IDs **must** be unique between clients. Client Secrets **must** be long and randomly generated. The Client Secret field on the OIDC Client page can be randomly generated and copied it to the clipboard for use in the OIDC Client application. Client Secrets are encrypted on disk.

> [!NOTE]
> Public clients can be configured by selecting the `None (Public)` option from the `Auth Method` dropdown on the OIDC Client page. These clients do not require a Client Secret but do require PKCE, which your Public Client Application should provide.

## <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/arcane.svg" width="28" /> Arcane

Arcane can be set up to use VoidAuth as an OIDC Provider in two ways, through the Web GUI or through Environment Variables. Please see the [Arcane SSO Docs](https://arcane.ofkm.dev/docs/configuration/sso) for the details of both options.

Arcane OIDC Setup Environment Variables:

```
OIDC_ENABLED: true
OIDC_CLIENT_ID: your-client-id
OIDC_CLIENT_SECRET: your-client-secret
OIDC_ISSUER_URL: Copy from OIDC Info in VoidAuth (OIDC Issuer Endpoint)
OIDC_SCOPES: openid email profile groups
OIDC_ADMIN_CLAIM: groups
OIDC_ADMIN_VALUE: your-admin-role

# Optionally merge accounts by email address
# OIDC_MERGE_ACCOUNTS: true
```

In VoidAuth OIDC Client Page:

```
Client ID: your-client-id
Auth Method: Client Secret Post
Client Secret: your-client-secret
Redirect URLs: https://arcane.example.com/auth/oidc/callback
```

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

In VoidAuth OIDC Client Page:
```
Client ID: your-client-id
Auth Method: Client Secret Basic
Client Secret: your-client-secret
Redirect URLs: https://beszel.example.com/api/oauth2-redirect
```

## <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/cloudflare.svg" width="28" /> Cloudflare ZeroTrust

In Cloudflare:

1. Navigate to the **[Cloudflare ZeroTrust Dashboard](https://dash.teams.cloudflare.com)** > **Settings** > **Authentication**
2. In the `Login methods` tab, select `Add new`
3. Choose `OpenID Connect`
4. Fill out the form as follows:
    - Name: `VoidAuth`
    - App ID: `your-client-id`
    - Client secret: `your-client-secret`
    - Auth URL: `Copy from OIDC Info in VoidAuth (Authorization Endpoint)`
    - Token URL: `Copy from OIDC Info in VoidAuth (Token Endpoint)`
    - Certificate URL: `Copy from OIDC Info in VoidAuth (JWKs Endpoint)`
    - Proof Key for Code Exchange (PKCE): `ON`
    - Optional configurations > OIDC Claims: `mail, preferred_username`

In VoidAuth OIDC Client Page:

```
Client ID: your-client-id
Auth Method: Client Secret Basic
Client Secret: your-client-secret
Redirect URLs: https://your-team-name.cloudflareaccess.com/cdn-cgi/access/callback
```

## <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/grist.svg" width="28" /> Grist

Grist OIDC Setup Environment Variables:

```
GRIST_OIDC_IDP_ISSUER: Copy from OIDC Info in VoidAuth (OIDC Issuer Endpoint)
GRIST_OIDC_IDP_CLIENT_ID: your-client-id
GRIST_OIDC_IDP_CLIENT_SECRET: your-client-secret
GRIST_OIDC_SP_IGNORE_EMAIL_VERIFIED: true
```

In VoidAuth OIDC Client Page:

```
Client ID: your-client-id
Auth Method: Client Secret Basic
Client Secret: your-client-secret
Redirect URLs: https://grist.example.com/oauth2/callback
PostLogout URL: https://grist.example.com/signed-out
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

In VoidAuth OIDC Client Page:

```
Client ID: your-client-id
Auth Method: Client Secret Post
Client Secret: your-client-secret
Redirect URLs:
  - https://immich.example.com/auth/login
  - https://immich.example.com/user-settings
  - app.immich:///oauth-callback
```

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
OID Endpoint: Copy from VoidAuth OIDC Info (OIDC Issuer Endpoint)
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

In VoidAuth OIDC Client Page:
```
Client ID: your-client-id
Auth Method: Client Secret Post
Client Secret: your-client-secret
Redirect URLs: https://jellyfin.example.com/sso/OID/redirect/VoidAuth
```

## <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/png/manyfold.png" width="28" /> Manyfold

Manyfold OIDC Setup Environment Variables:

```
MULTIUSER: true
PUBLIC_HOSTNAME: manyfold.example.com
OIDC_CLIENT_ID: your-client-id
OIDC_CLIENT_SECRET: your-client-secret
OIDC_ISSUER: Copy from OIDC Info in VoidAuth (OIDC Issuer Endpoint)
OIDC_NAME: VoidAuth
# Optional:
# FORCE_OIDC: true
```

In VoidAuth OIDC Client Page:

```
Client ID: your-client-id
Auth Method: Client Secret Basic
Client Secret: your-client-secret
Redirect URLs: https://manyfold.example.com/users/auth/openid_connect/callback
```


## <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/mastodon.svg" width="28" /> Mastodon

Mastodon OIDC Setup Environment Variables:

```
OIDC_ENABLED: true
OIDC_DISCOVERY: true
OIDC_ISSUER: Copy from OIDC Info in VoidAuth (OIDC Issuer Endpoint)
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

In VoidAuth OIDC Client Page:

```
Client ID: your-client-id
Auth Method: Client Secret Basic
Client Secret: your-client-secret
Redirect URLs: https://mastodon.example.com/auth/auth/openid_connect/callback
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
```

In VoidAuth OIDC Client Page:

```
Client ID: your-client-id
Auth Method: Client Secret Basic
Client Secret: your-client-secret
Redirect URLs: https://openwebui.example.com/oauth/oidc/callback
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
> [!NOTE]
> Scopes are separated by spaces, **not** by commas

In VoidAuth Create OIDC Client:

```
Client ID: your-client-id
Auth Method: Client Secret Post
Client Secret: your-client-secret
Redirect URLs: https://portainer.example.com
```
Screenshot(s):
<img width="1400" src="/public/screenshots/f7cf9712-4259-43ce-bde1-fbe22a447763.png" />


## <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/seafile.svg" width="28" /> Seafile

In Seafile, add these lines to the configuration file named `seahub_settings.py`:

```
ENABLE_OAUTH = True
OAUTH_CREATE_UNKNOWN_USER = True          #To create users not yet known to Seafile
OAUTH_ACTIVATE_USER_AFTER_CREATION = True #To auto-activate new users
OAUTH_ENABLE_INSECURE_TRANSPORT = False   #To allow http without ssl between Seafile and VoidAuth

OAUTH_CLIENT_ID = "your-client-id"
OAUTH_CLIENT_SECRET = "your-client-secret"
OAUTH_REDIRECT_URL = 'https://seafile.example.com/oauth/callback/'
OAUTH_PROVIDER_DOMAIN = 'voidauth.example.com' #Deprecated, replaced by OAUTH_PROVIDER, filled just in case.
OAUTH_PROVIDER = 'voidauth.example.com'
OAUTH_AUTHORIZATION_URL = 'https://voidauth.example.com/oidc/auth'
OAUTH_TOKEN_URL = 'https://voidauth.example.com/oidc/token'
OAUTH_USER_INFO_URL = 'https://voidauth.example.com/oidc/me'
OAUTH_SCOPE = ["openid","profile","email",]
OAUTH_ATTRIBUTE_MAP = {
    "sub": (True, "uid"),
    "email": (False, "email"),
    "name": (False, "name"),
}
```
> [!NOTE]
> You will need to reboot seafile server to take the modifications into account.

In VoidAuth OIDC Client Page:

```
Client ID: your-client-id
Auth Method: Client Secret Basic
Client Secret: your-client-secret
Redirect URLs: https://seafile.example.com/oauth/callback/
```


## <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/wiki-js.svg" width="28" /> WikiJS

1. Connect to WikiJS portal as an admin
2. Go to Configuration Panel, and then Authentication Tab
3. Create a new authentication strategy using "Generic OpenID Connect / OAuth 2"
4. Fill, customize and save these fields in the new configuration view:

```
Client ID : your-client-id
Client Secret : your-client-secret
Authorization Endpoint URL : Copy from OIDC Info in VoidAuth (Authorization Endpoint)
Token Endpoint URL : Copy from OIDC Info in VoidAuth (Token Endpoint)
User Info Endpoint URL : Copy from OIDC Info in VoidAuth (UserInfo Endpoint)
Issuer: Copy from OIDC Info in VoidAuth (OIDC Issuer Endpoint)
Email Claim : email
Display Name Claim : name
Groups Claim : groups
Logout URL : Copy from OIDC Info in VoidAuth (Logout Endpoint)
```
> [!NOTE]
> Make sure you enabled the authentication strategy.

In VoidAuth OIDC Client Page:

```
Client ID: your-client-id
Auth Method: Client Secret Post
Client Secret: your-client-secret
Redirect URLs: https://wikijs.example.com/login/token-given-on-wikijs-authentication-strategy-view-check-below/callback
```


## <img src="https://raw.githubusercontent.com/usememos/.github/refs/heads/main/assets/logo-rounded.png" width="28" /> Memos

1. Connect to Memos as an admin user
2. Click on the *user icon* at the bottom left, then on *Settings*, and finally on *SSO*
3. Click on the *Create* button and select *Custom* from the *Template* menu
4. Fill, customize and save these fields in the new configuration:

```
Client ID : your-client-id
Client Secret : your-client-secret
Authorization endpoint : Copy from OIDC Info in VoidAuth (Authorization Endpoint)
Token endpoint : Copy from OIDC Info in VoidAuth (Token Endpoint)
User endpoint : Copy from OIDC Info in VoidAuth (UserInfo Endpoint)
Scopes : openid profile email offline_access
Identifier : preferred_username
Display Name : name
Email : email
```

> [!NOTE]
> Scopes are separated by spaces, **not** by commas

In VoidAuth OIDC Client Page:

```
Client ID: your-client-id
Auth Method: Client Secret Post
Client Secret: your-client-secret
Redirect URLs: https://memos.example.com/auth/callback
```
