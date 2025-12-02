![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/voidauth/voidauth/release.yml)
![GitHub License](https://img.shields.io/github/license/voidauth/voidauth)
![GitHub Release](https://img.shields.io/github/v/release/voidauth/voidauth?logo=github)
![GitHub Repo stars](https://img.shields.io/github/stars/voidauth/voidauth?style=flat&logo=github)


<br>
<p align="center">
  <a href='https://voidauth.app'>
    <img src="https://raw.githubusercontent.com/voidauth/voidauth/refs/heads/main/docs/logo_full_text.svg" width="180" title="VoidAuth" alt="VoidAuth logo"/>
  </a>
</p>

<p align="center">
  <strong>
    Single Sign-On for Your Self-Hosted Universe
  </strong>
</p>

<br>

<div align="center">
  <a href="https://voidauth.app">Website</a> |
  <a href="https://github.com/voidauth/voidauth">Source Code</a>
</div>

<br>

<p align="center">
  <img src="https://raw.githubusercontent.com/voidauth/voidauth/refs/heads/main/docs/public/screenshots/2f8c15db-28fd-4b0e-a266-1dddd9cf9e3a.png" title="Login Portal" alt="Login Portal" width="240">
</p>

## What is VoidAuth

VoidAuth is an open-source SSO authentication and user management provider that stands guard in front of your self-hosted applications. It is easy-to-use for admins and end-users, supports nice-to-have features like passkeys, user invitation, self-registration, email support, and more!

Key Features:

- 🌐 OpenID Connect (OIDC) Provider
- 🔄 Proxy ForwardAuth
- 👤 User Management
- 📨 User Self-Registration and Invitations
- 🎨 Customizable (Logo, Title, Theme Color, Email Templates)
- 🔑 Multi-factor Authentication, Passkeys, and Passkey-Only Accounts
- 📧 Secure Password Reset with Email Verification
- 🔒 Encryption-At-Rest with Postgres or SQLite Database

### Admin Panel

Administrators can access the Admin Panel in the sidebar menu, where they can manage users, groups, and settings of the VoidAuth instance.

<p align="center">
  <img src="https://raw.githubusercontent.com/voidauth/voidauth/refs/heads/main/docs/public/screenshots/admin_panel.png" title="Admin Panel" alt="An Admin Page with the Admin Side Panel Open" width="600">
</p>

## Quick Start

Getting started with VoidAuth is straightforward, the recommended approach is to add VoidAuth to a `compose.yml` file:

``` yaml
services:
  # ---------------------------------
  # Your reverse-proxy service here:
  # caddy, traefik, nginx, etc.
  # ---------------------------------

  voidauth: 
    image: voidauth/voidauth:latest
    restart: unless-stopped
    volumes:
      - /your/config/directory:/app/config
    environment:
      # Required environment variables
      # More environment variable options can be found 
      #   on the Getting Started page.
      APP_URL: # required
      STORAGE_KEY: # required
      DB_PASSWORD: # required, same as voidauth-db POSTGRES_PASSWORD
      DB_HOST: voidauth-db # required
    depends_on:
      - voidauth-db

  voidauth-db:
    image: postgres:18
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: # required, same as voidauth DB_PASSWORD
    volumes:
      - db:/var/lib/postgresql/18/docker

volumes:
  db:
```

After creating/updating the compose.yml file and filling in the required environment variables, run `docker compose up -d` and visit your `APP_URL` to get started.

> [!IMPORTANT]
> After VoidAuth starts for the first time, find the initial administrator username and password in the logs: `docker compose logs voidauth`

Please see the [Getting Started](https://voidauth.app/#/Getting-Started) page for setup details and configuration options.

## Support

Issues, Suggestions, and Feature Requests should be added as [Issues](https://github.com/voidauth/voidauth/issues) of the appropriate type. For Help and Support, Q&A, or anything else; open a [Discussion](https://github.com/orgs/voidauth/discussions). This project is actively monitored, I will likely respond quickly.

## Contributing

Please read the CONTRIBUTING.md

## Disclaimer

VoidAuth has not been audited and uses 3rd party packages for much of its functionality, use at your own risk.

## Credits

This project would not be possible without the incredible work of others including but not limited to:

[node-oidc-provider](https://github.com/panva/node-oidc-provider) Handles OIDC Provider functionality

[SimpleWebAuthn](https://github.com/MasterKale/SimpleWebAuthn) Used for webauthn/passkey support

[Angular](https://angular.dev) Frontend web framework

[Knex](https://knexjs.org/) Database connection and query builder

[zxcvbn-ts](https://zxcvbn-ts.github.io/zxcvbn/) Password strength calculator

## Sponsors

[![](https://github.com/GitTimeraider.png?size=50)](https://github.com/GitTimeraider)
