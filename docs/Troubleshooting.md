# Troubleshooting

Some common issues and their causes.

### Could Not Create Session

The `x-voidauth-session` or `x-voidauth-interaction` cookies could not be set. Make sure that the `APP_URL` environment variable is set to the public URL of VoidAuth, and that you are accessing the app from that URL.

This may also be caused by an invalid `SESSION_DOMAIN` environment variable, browsers may not allow setting cookies on some domains (ex. `com`, `co.uk`, `lan`). You can read more at the [Mozilla HTTP Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies#define_where_cookies_are_sent) documentation.

### Invalid Client

Make sure that an OIDC App has been created, and that the `Client ID` parameter in VoidAuth and the 'Client' application match exactly.

### Invalid Redirect Uri

The 'Client' application should specify the correct `Redirect URL` parameter for entry into VoidAuth. This is commonly located in the OIDC documentation of the application or on it's OIDC Setup page if it has one. You may also be able to find an example for the application on the [OIDC App Guides](OIDC-Guides.md) page.
