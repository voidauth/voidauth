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
> At the very top of the OIDC App pages there is a drop-down panel with info about the VoidAuth OIDC Provider that the 'Client' application will probably need during its OIDC setup.

<p align=center>
<img src="/public/screenshots/oidc_endpoints.png" width="500">
</p>

> [!NOTE]
> The `Redirect URLs` and `PostLogout URL` fields support wildcards, though care should be taken when using them. Please make sure to follow application documentation when using wildcard Redirect URLs.

The OIDC App page starts with sensible defaults, but you must follow the application OIDC setup guide parameters exactly or it is likely your OIDC integration will not work. You can see setup guides for some applications on the [OIDC App Guides](OIDC-Guides.md) page.