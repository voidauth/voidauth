# Reverse Proxy Setup

In examples and guides below, `example.com` will be used as a stand-in for your domain. VoidAuth can be served over a subdomain (ex. `https://auth.example.com`) or a subdirectory (ex. `https://example.com/auth`). Examples for both will be given.

> [!IMPORTANT]
> When serving VoidAuth over a subdirectory, do **NOT** rewrite the path or hostname. Both are used during important redirects including login.

> [!TIP]
> Make sure the `APP_URL` environment variable includes the base path VoidAuth will be served on, if any. Ex. `APP_URL: https://example.com/auth`

## Caddy

Caddy is configured with a `Caddyfile`, you can look up basic reverse-proxy information [here](https://caddyserver.com/docs/quick-starts/reverse-proxy) and Caddy docker compose configuration [here](https://caddyserver.com/docs/running#docker-compose). Below is a basic `Caddyfile` example showing VoidAuth served over subdomain and subdirectory (you should not use both):

`Caddyfile`
``` Caddyfile
# Serve Voidauth:

## on a subdomain
auth.example.com {
  reverse_proxy voidauth:3000
}

## or on a subdirectory
example.com {
  # DO NOT rewrite or strip the path
  # use handle instead of handle_path
  handle /auth/* {
    reverse_proxy voidauth:3000
  }
}
```