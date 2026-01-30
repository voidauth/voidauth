# Troubleshooting

Some common issues and their causes.

### Could Not Create Session

The `x-voidauth-session` or `x-voidauth-interaction` cookies could not be set. Make sure that the `APP_URL` environment variable is set to the public URL of VoidAuth, and that you are accessing the app from that URL.

This may also be caused by an invalid `SESSION_DOMAIN` environment variable value (including the default). Browsers may not allow setting cookies on top-level domains (ex. `com`, `co.uk`, `lan`) as well as some public domains (ex. `azurewebsites.net`, `cdn.cloudflare.net`). You can read more at the [Mozilla HTTP Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies#define_where_cookies_are_sent) documentation and see the current [Public Suffix List](https://publicsuffix.org/list/) for restricted domains.

### Invalid Client

Make sure that an OIDC App has been created, and that the `Client ID` parameter in VoidAuth and the 'Client' application match exactly.

### Invalid Redirect Uri

The 'Client' application should specify the correct `Redirect URL` parameter for entry into VoidAuth. This is commonly located in the OIDC documentation of the application or on it's OIDC Setup page if it has one. You may also be able to find an example for the application on the [OIDC App Guides](OIDC-Guides.md) page.

### The Page Cannot Be Found

#### When Attempting to Authenticate an OIDC App

If you are redirected to the **Cannot Be Found** page while attempting to authenticate to an OIDC App, a possible cause could be that one of the VoidAuth Endpoint URLs Required by the OIDC App during its setup were input incorrectly. You can find the correct Endpoint URLs on the VoidAuth Admin OIDC Apps pages at the top of the page in the dropdown.

### Not Redirected After Login

If you are attempting to authenticate to a ProxyAuth Domain and are not redirected after successful VoidAuth login, it may be caused by incorrect `X-Forwarded-*` headers reaching VoidAuth from a reverse proxy. These headers tell VoidAuth where you are trying to authenticate and where you will be redirected, please view the [ProxyAuth](ProxyAuth-and-Trusted-Header-SSO-Setup.md) page and make sure the reverse proxy is set up correctly.
