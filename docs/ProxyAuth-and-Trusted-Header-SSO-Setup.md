# ProxyAuth

## Setup
ProxyAuth Domains are protected through a collaboration between your reverse-proxy and VoidAuth. When a user navigates to a protected domain, your reverse-proxy will check with VoidAuth to ensure the user is logged in and should have access. 

You can set up ProxyAuth secured domains on the VoidAuth Admin ProxyAuth Domains page.

<p align=center>
<img align=center src="/public/screenshots/b774693a-6ef2-4d15-b193-dbc1a8388f3a.png" width="300" />
</p>

> [!CAUTION]
> If no group is assigned to a ProxyAuth Domain, then **any signed in user** will have access to that domain.

When a user navigates to a protected domain, their access will be checked against all ProxyAuth Domains from **most specific** to **least specific**. In the example below, a user with only the group **users** would **not** have access to **app.example.com/admin/user_accounts** but would have access to **app.example.com/home**. They would likewise not have access to **secret.example.com**.

<p align=center>
<img align=center src="/public/screenshots/3f0b0afc-5bcf-436c-8def-f45e68adb019.png" width="800" />
</p>

When creating ProxyAuth Domains, remember that the trailing "**/**" and separators like "**.**" **ARE CHECKED**. Access to ***.example.com** would not give access to **example.com**, they must be added seperately.

> [!IMPORTANT]
> You can set up a wildcard ProxyAuth Domain **\*/\*** which will cover any domain not specifically listed in your ProxyAuth Domain settings. Special care should be taken to make sure such a domain has a restrictive group assigned like **owners** or **admins**.

### ProxyAuth and Trusted Header SSO Details

ProxyAuth Domains perform multiple steps to determine whether a request should be granted or denied. The following actions happen in VoidAuth during process:

1. Check for Authorization Header Basic Auth, and if so identify the user by username and password in the header. If the user is not found respond with a 401 status code and the WWW-Authenticate response header set.
2. Check if the request has a valid user Session Cookie, if not then redirect to the login page.
3. Find which ProxyAuth Domain matches the request host and path. If there is none found respond with a 403 Forbidden status code.
3. If the user has a security group which would grant access to the ProxyAuth Domain or if the ProxyAuth Domain has no groups, grant access to the resource. If not, respond with a 403 Forbidden status code.

If a request is allowed, the following headers will be set on the response which enabled Trusted Header SSO on certain selfhosted applications:
* Remote-User
* Remote-Email
* Remote-Name
* Remote-Groups

## Reverse-Proxy Setup

VoidAuth exposes two proxy auth endpoints, which one you use will depend on your reverse-proxy.

| Endpoint                | Reverse Proxy |
| ------------------------| ------------- |
| /api/authz/forward-auth | [Caddy](https://caddyserver.com/docs/caddyfile/directives/forward_auth), [Traefik](https://doc.traefik.io/traefik/middlewares/http/forwardauth/)  |
| /api/authz/auth-request | [NGINX](https://nginx.org/en/docs/http/ngx_http_auth_request_module.html) |

> [!WARNING]
> You must set up your reverse-proxy **AND** VoidAuth correctly to protect a domain! This will usually involve modifying your reverse-proxy config to put the domain 'behind' VoidAuth, and then adding that domain to the VoidAuth ProxyAuth Domain list with an access group(s).

### Caddy
You can setup ProxyAuth using [Caddy](https://caddyserver.com) as a reverse-proxy with the following CaddyFile which protects domain **app.example.com** using VoidAuth hosted on **auth.example.com**
``` Caddyfile
# Serve the authentication gateway itself
auth.example.com {
  reverse_proxy voidauth:3000
}

# Serve your app
app.example.com {
  forward_auth voidauth:3000 {
    uri /api/authz/forward-auth
    copy_headers Remote-User Remote-Groups Remote-Name Remote-Email
  }

  reverse_proxy app:8080
}
```