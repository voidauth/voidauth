# OIDC Setup

When setting up OIDC Clients (Apps) you should follow the guide provided by the 'Client' application. You will be able to set all the configuration values using the OIDC Clients admin page by creating a new OIDC Client. An example App OIDC documentation guide:

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

If a configuration property is omitted from an [OIDC Client Guide](OIDC-Guides.md) it is likely that the default value will work. The OIDC Client page also includes optional configurations such as `Groups`, `Logo URL`, `Skip Consent`, and `MFA Required`.

> [!IMPORTANT]
> At the top of the OIDC Clients pages there is a drop-down panel with info about the VoidAuth OIDC Provider that your Client application will probably need during its OIDC setup.

<p align=center>
<img src="/public/screenshots/oidc_endpoints.png" width="500">
</p>

> [!IMPORTANT]
> The OIDC Client page starts with sensible defaults, but you must follow the application OIDC setup guide parameters exactly or it is likely your OIDC integration will not work. You can see setup guides for some applications on the [OIDC Guides](OIDC-Guides.md) page.