# Troubleshooting

Some common issues and their causes.

### Initial Admin Reset Link Not Working

#### Link Expired

If it has been longer than one day since the first start of VoidAuth, the password reset link generated for the initial `auth_admin` user may be expired. You will need to either:

- Generate a new password reset link for the `auth_admin` account using the VoidAuth CLI. Documentation for this can be found on the [Generate Password Reset](CLI-Commands.md#generate-password-reset) section of the CLI Commands page.
- Remove or reset your VoidAuth database and start over. For a database with VoidAuth as its only tenant, such as a sqlite database or postgres database container, this can be as simple as deleting the database and recreating it.

### Could Not Create Session

The `x-voidauth-session` or `x-voidauth-interaction` cookies could not be set. Make sure that the `APP_URL` environment variable is set to the public URL of VoidAuth, and that you are accessing the app from that URL.

This may also be caused by an invalid `SESSION_DOMAIN` environment variable value (including the default). Browsers may not allow setting cookies on top-level domains (ex. `com`, `co.uk`, `lan`) as well as some public domains (ex. `azurewebsites.net`, `cdn.cloudflare.net`). You can read more at the [Mozilla HTTP Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies#define_where_cookies_are_sent) documentation and see the current [Public Suffix List](https://publicsuffix.org/list/) for restricted domains.

### Invalid Client

Make sure that an OIDC App has been created, and that the `Client ID` parameter in VoidAuth and the OIDC App match exactly.

### Invalid Redirect Uri

The 'Client' application should specify the correct `Redirect URL` parameter for entry into VoidAuth. This is commonly located in the OIDC documentation of the application or on its OIDC Setup page if it has one. You may also be able to find an example for the application on the [OIDC App Guides](OIDC-Guides.md) page.

### The Page Cannot Be Found

#### When Attempting to Authenticate an OIDC App

If you are redirected to the **Cannot Be Found** page while attempting to authenticate to an OIDC App, a possible cause could be that one of the VoidAuth Endpoint URLs Required by the OIDC App during its setup were input incorrectly. You can find the correct Endpoint URLs on the VoidAuth Admin OIDC Apps pages at the top of the page in the dropdown.

### Not Redirected After Login

If you are attempting to authenticate to a ProxyAuth Domain and are not redirected after successful VoidAuth login, it may be caused by incorrect `X-Forwarded-*` headers reaching VoidAuth from a reverse proxy. These headers tell VoidAuth where you are trying to authenticate and where you will be redirected, please view the [ProxyAuth](ProxyAuth-and-Trusted-Header-SSO-Setup.md) page and make sure the reverse proxy is set up correctly.

### Logging

#### IP Address Incorrect or Missing

If the Request IP Address in logs is incorrect or invalid, it may be caused by a misconfiguration in your reverse proxy. Check documentation for your reverse proxy or proxy provider related to trusted IP addresses.

### OIDC Information List

#### Incorrect Protocol

The list of OIDC Endpoints on the OIDC Apps pages may show the incorrect protocol (`http://` vs `https://`). This can be caused by an intermittent proxy layer between the browser and VoidAuth either not setting the `X-Forwarded-Proto` header or not trusting an upstream proxy that has set it. Some reverse proxy providers set this header automatically, some require you to specify the header value manually. An example of how to set this can be seen in the NGINX reverse proxy snippets setup documentation [here](ProxyAuth-and-Trusted-Header-SSO-Setup.md#nginx-snippets).
