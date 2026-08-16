# OIDC App Setup

When setting up OIDC Apps you should follow the guide provided by the 'Client' application. You can create a new OIDC App from the admin OIDC page. An example App OIDC documentation guide:

```
Client ID: your-client-id
Client Secret: your-client-secret
Redirect URLs: https://client-domain.com/oidc/callback
Auth Method: Client Secret Post
Response Types: code
Grant Types: authorization_code
```

Could be filled out in VoidAuth as follows:

<p align=center>
<img src="/public/screenshots/oidc_client.png" width="500">
</p>

If a configuration property is omitted from an [OIDC App Guide](OIDC-Guides.md) it is likely that the default value will work. The OIDC App page also includes optional configurations at the top such as `Display Name`, `Logo URL`, `Groups`, `Skip Consent`, and `MFA Required`.

> [!IMPORTANT]
> At the top of the OIDC App pages there is a drop-down panel with info about the VoidAuth OIDC Provider that the 'Client' application will probably need during its OIDC setup.

<p align=center>
<img src="/public/screenshots/oidc_endpoints.png" width="500">
</p>

> [!NOTE]
> The `Redirect URLs` and `PostLogout URL` fields support wildcards, though care should be taken when using them. Please make sure to follow application documentation when using wildcard Redirect URLs.

The OIDC App page starts with sensible defaults, but you must follow the application OIDC setup guide parameters exactly or it is likely your OIDC integration will not work. You can see setup guides for some applications on the [OIDC App Guides](OIDC-Guides.md) page.

## Declared OIDC Apps

VoidAuth also supports declaring OIDC Apps through environment variables and [docker labels](https://docs.docker.com/engine/manage-resources/labels/). Declared OIDC Apps are stored in memory and take priority over OIDC Apps with the same client-id that have been configured through the web interface.

An OIDC App can be configured via environment variables as follows:

```nix
OIDC_<client-id>_CLIENT_SECRET="1234"
OIDC_<client-id>_CLIENT_REDIRECT_URLS="https://example.com, https://test.example.com"
etc...
```

Or an OIDC App can be configured through docker labels as follows:

```nix
# client id inferred from container name
voidauth.enable=true
voidauth.oidc.<client-id>.client_secret=1234
voidauth.oidc.<client-id>.client_redirect_urls=https://example.com, https://test.example.com
etc...
```

As docker containers on the same host start, stop, and restart; VoidAuth will be notified and update its configurations accordingly.

Due to the nature of the configuration options, there are limitations on Declared OIDC Apps. Environment Variable Declared OIDC Apps may not have `_` in their `client-id`, and similarly a Docker Label Declared OIDC App `client-id` may not contain `.`.

All the configurable variables can be found below:

| Variable                | Default                           | Possible Values                               |
|-------------------------|-----------------------------------|-----------------------------------------------|
| CLIENT_DISPLAY_NAME     |                                   |                                               |
| CLIENT_HOMEPAGE_URL     |                                   |                                               |
| CLIENT_LOGO_URL         |                                   |                                               |
| CLIENT_SECRET           |                                   |                                               |
| CLIENT_AUTH_METHOD      | client_secret_basic               | client_secret_basic, client_secret_post, none |
| CLIENT_GROUPS           |                                   |                                               |
| CLIENT_REDIRECT_URLS    |                                   |                                               |
| CLIENT_RESPONSE_TYPES   | code                              | code, id_token, token, none                   |
| CLIENT_GRANT_TYPES      | authorization_code, refresh_token | authorization_code, implicit, refresh_token   |
| CLIENT_POST_LOGOUT_URLS |                                   |                                               |
| CLIENT_SKIP_CONSENT     | false                             | true, false                                   |

## Custom Claims

Custom claims let you add extra data to a user that is included in OIDC tokens and user-info responses. Some OIDC Apps allow or require custom claims to control aspects of an account, such as storage limits or roles.

Custom claims can be set directly on a user or inherited from one or more groups. The effective set of applied claims for a user is calculated automatically and shown on the admin user page. Claims are name/value pairs that are attached to a user or a group. When a token is issued, the value is parsed with `JSON.parse(...)` to determine its type before it is sent. If parsing fails, the value is sent as a raw string.

This means you can send simple strings, numbers, objects, or arrays as values of a custom claim.

### Priority and merging

Claims are applied in the following order:

1. Claims assigned directly to the user.
2. Claims from the user's groups, added only if the claim name is not already present from the user or a higher-priority group.

If a user belongs to multiple groups that define the same claim name, the group that sorts earlier alphabetically by name is applied. Later groups are ignored for that claim name.

You can see all of a user's custom claims on their admin user page. Claims that are overridden by a higher-priority source are shown greyed out and marked as not applied.

### Value formats

Custom claim values are stored as text and parsed when applied. Examples:

```jsonc
// Un-quoted value that fails `JSON.parse`, parsed as a raw string by default
abc

// A number
123

// A quoted value is always parsed as a raw string
"123"

// This value is parsed by `JSON.parse` as an `object`
{"key": "value", "another_key": 1}

// This value is parsed as an array of assorted items
["abc", "xyz", 123, "-_-"]
```
