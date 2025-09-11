# OIDC Setup

When setting up OIDC Clients (Apps) you should follow the guide provided by the 'client' application. You will be able to set all the configuration values using the VoidAuth OIDC Clients admin page by creating a new OIDC Client. An example App OIDC documentation guide:

```
client_id: "your-client-id"
client_secret: "a secure secret"
redirect_url: "https://client-domain.com/oidc/callback"
token_endpoint_auth_method: "client_secret_post"
response_types: "code"
grant_types: "authorization_code"
```

Could be filled out in VoidAuth as follows:

<img src="/public/screenshots/oidc_client.png" width="300">

> [!IMPORTANT]
> At the top of the OIDC Clients pages there is a drop-down panel with info about the VoidAuth OIDC Provider that your Client application will probably need during its OIDC setup.

> [!IMPORTANT]
> The OIDC Client page starts with sensible defaults, but you must follow the application OIDC setup guide parameters exactly or it is likely your OIDC integration will not work. You can see setup guides for some applications on the [OIDC Guides](OIDC-Guides.md) page.