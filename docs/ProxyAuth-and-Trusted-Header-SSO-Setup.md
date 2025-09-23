# ProxyAuth

ProxyAuth Domains are protected through a collaboration between your reverse-proxy and VoidAuth. When a user navigates to a protected domain, your reverse-proxy will check with VoidAuth to ensure the user is logged in and should have access. 

You can set up ProxyAuth secured domains on the VoidAuth Admin ProxyAuth Domains page.

<p align=center>
<img align=center src="/public/screenshots/b774693a-6ef2-4d15-b193-dbc1a8388f3a.png" width="300" />
</p>

> [!CAUTION]
> If no group is assigned to a ProxyAuth Domain, then **any signed in user** will have access to that domain.

When a user navigates to a protected domain their access will be checked against the first matching ProxyAuth Domain, from **most specific** to **least specific**. In the example below, a user with only the group **[users]** would **not** have access to **app.example.com/admin/user_accounts** but would have access to **app.example.com/home**. They would likewise not have access to **secret.example.com**.

<p align=center>
<img align=center src="/public/screenshots/3f0b0afc-5bcf-436c-8def-f45e68adb019.png" width="800" />
</p>

When creating ProxyAuth Domains, remember that the trailing "**/**" and separators like "**.**" **ARE CHECKED**. Access to ***.example.com** would not give access to **example.com**, they must be added seperately.

> [!IMPORTANT]
> You can set up a wildcard ProxyAuth Domain **\*/\*** which will cover any domain not specifically listed in your ProxyAuth Domain settings. Special care should be taken to make sure such a domain has a restrictive group assigned like **owners** or **admins**, this will match any request not already matched by another ProxyAuth Domain.

## ProxyAuth and Trusted Header SSO

ProxyAuth Domains perform multiple steps to determine whether a request should be granted or denied. The following actions happen in VoidAuth during process:

1. Check for Authorization Header Basic Auth, and if so identify the user by username and password in the header. If the user is not found respond with a 401 status code and the WWW-Authenticate response header set.
2. If the request did not have an Authorization Header, check if the request has a valid user Session Cookie and if not then redirect to the login page.
3. If a user was found, determine which ProxyAuth Domain matches the request host and path. If there is none found respond with a 403 Forbidden status code.
3. If the user has a security group which would grant access to the ProxyAuth Domain or if the ProxyAuth Domain has no groups, grant access to the resource. If not, respond with a 403 Forbidden status code.

If a request is allowed, the following headers will be set on the response. This enables Trusted Header SSO on certain self-hosted applications:
* Remote-User
* Remote-Email
* Remote-Name
* Remote-Groups

## Reverse-Proxy ProxyAuth Setup

VoidAuth exposes two proxy auth endpoints, which one you use will depend on your reverse-proxy.

| Endpoint                | Reverse Proxy |
| ------------------------| ------------- |
| /api/authz/forward-auth | [Caddy](https://caddyserver.com/docs/caddyfile/directives/forward_auth), [Traefik](https://doc.traefik.io/traefik/middlewares/http/forwardauth/)  |
| /api/authz/auth-request | [NGINX](https://nginx.org/en/docs/http/ngx_http_auth_request_module.html) |

These endpoints are mostly the same, but limitations in NGINX make a separate endpoint necessary.

> [!WARNING]
> You must set up your reverse-proxy **AND** VoidAuth correctly to protect a domain! This will usually involve modifying your reverse-proxy config to put the domain 'behind' VoidAuth, and then adding that domain to the VoidAuth ProxyAuth Domain list with an access group(s).

### Caddy

You can setup ProxyAuth using [Caddy](https://caddyserver.com) as a reverse-proxy with the following CaddyFile which protects domain **app.example.com** using VoidAuth hosted on **auth.example.com**
``` Caddyfile
# Serve VoidAuth
auth.example.com {
  reverse_proxy voidauth:3000
}

# # or Serve VoidAuth on sub-directory of example.com
# example.com {
#   # DO NOT rewrite or strip the path
#   # use 'handle' instead of 'handle_path'
#   handle /auth/* {
#     reverse_proxy voidauth:3000
#   }
# }

# Serve your protected app
app.example.com {
  forward_auth voidauth:3000 {
    uri /api/authz/forward-auth
    copy_headers Remote-User Remote-Groups Remote-Name Remote-Email
  }

  reverse_proxy app:8080
}
```

### NGINX Snippets

In order to use NGINX or NGINX Proxy Manager, you will need to make a `snippets/` directory available to their configuration. In all examples, this will mounted/available be at `/config/nginx/snippets/`.

`proxy.conf`
```
proxy_set_header Host $host;
proxy_set_header X-Original-URL $scheme://$http_host$request_uri;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $http_host;
proxy_set_header X-Forwarded-URI $request_uri;
proxy_set_header X-Forwarded-For $remote_addr;
```

`auth-location.conf`
```
location /api/authz/auth-request {
  internal;

  include /config/nginx/snippets/proxy.conf;

  # extra settings, don't pass the entire body to auth_request
  proxy_set_header Content-Length "";
  proxy_set_header Connection "";
  proxy_pass_request_body off;

  # url to send auth_request. Should be ${APP_URL}/api/authz/auth-request
  proxy_pass http://voidauth:3000/api/authz/auth-request;
}
```

`proxy-auth.conf`
```
auth_request /api/authz/auth-request;

proxy_set_header Remote-User $upstream_http_remote_user;
proxy_set_header Remote-Groups $upstream_http_remote_groups;
proxy_set_header Remote-Email $upstream_http_remote_name;
proxy_set_header Remote-Name $upstream_http_remote_email;

# If response 401 code, try to redirect to Location header as if 302.
# NGINX auth_request cannot handle codes except 2xx and 4xx, this is a workaround
auth_request_set $redirection_url $upstream_http_location;
error_page 401 =302 $redirection_url;
```

### NGINX

NGINX is configured with a `nginx.conf` file mounted at `/etc/nginx/nginx.conf`. In this example, we will also be mounting config snippets at `/config/nginx/snippets/` that will be used in the configuration.

> [!WARNING]
> While outside the scope of this guide, you **MUST** setup `https://` termination for your browser-facing reverse-proxy with a certificate that the browser will trust or VoidAuth will **NOT** work properly. A bare NGINX reverse-proxy will **NOT** do this for you.

`nginx.conf`
```
events {
  worker_connections 1024;
}

http {

  # Serve VoidAuth
  server {
    listen 443 ssl http2;
    server_name auth.example.com;

    # SSL (https) config goes here...

    location / {
      include /config/nginx/snippets/proxy.conf;
      proxy_pass http://voidauth:3000;
    }
  }

  # # or Serve VoidAuth on a sub-directory of example.com
  # server {
  #   listen 443 ssl http2;
  #   server_name example.com;

  #   # Subdirectory hosting
  #   location /voidauth/ {
  #     include /config/nginx/snippets/proxy.conf;
  #     proxy_pass http://voidauth:3000;
  #   }
  # }

  # Serve your protected app
  server {
    listen 443 ssl http2;
    server_name app.example.com;

    # SSL (https) config goes here...

    # Snippet make VoidAuth available for auth_request
    include /config/nginx/snippets/auth-location.conf;

    location / {
      include /config/nginx/snippets/proxy.conf;
      # Snippet to send auth_request to VoidAuth before accessing protected app
      include /config/nginx/snippets/proxy-auth.conf;
      proxy_pass http://app:8080;
    }
  }
}
```

### NGINX Proxy Manager

As an NGINX based reverse-proxy, NGINX Proxy Manager also requires the same [NGINX Snippets](#nginx-snippets), which in all examples are assumed to be mounted at `/config/nginx/snippets/`. The following example will assume you are hosting VoidAuth and your protected app on their own sub-domains of example.com and must be adjusted if you are hosting either on sub-directories.

#### To Serve VoidAuth: 

1. Visit the `Proxy Hosts` page and `Add a Proxy Host`
2. Fill out the `Details` tab
    * <img src="/public/screenshots/NPM_voidauth_details.png" width="500" />
3. Fill out the `SSL` tab with your SSL configuration
4. Fill out the `Advanced` tab; this is done to allow including the `proxy.conf` snippet and will also be required for any protected apps we add later
    ```
    location / {
      include /config/nginx/snippets/proxy.conf;
      proxy_pass $forward_scheme://$server:$port;
    }
    ```
    * <img src="/public/screenshots/NPM_voidauth_advanced.png" width="500" />

#### To Serve Your Protected App:

1. Visit the `Proxy Hosts` page and `Add a Proxy Host`
2. Fill out the `Details` tab
    * <img src="/public/screenshots/NPM_app_details.png" width="500" />
3. Fill out the `SSL` tab with your SSL configuration
4. Fill out the `Advanced` tab; this configuration will include snippets that instruct NGINX to use VoidAuth for ProxyAuth
    ```
    include /config/nginx/snippets/auth-location.conf;

    location / {
      include /config/nginx/snippets/proxy.conf;
      include /config/nginx/snippets/proxy-auth.conf;
      proxy_pass $forward_scheme://$server:$port;
    }
    ```
    * <img src="/public/screenshots/NPM_app_advanced.png" width="500" />

### Traefik

`🚧 Under Construction 🚧`
