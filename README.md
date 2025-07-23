# VoidAuth

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/voidauth/voidauth/release.yml)
![GitHub License](https://img.shields.io/github/license/voidauth/voidauth)
![GitHub Release](https://img.shields.io/github/v/release/voidauth/voidauth?logo=github)
![Docker Image Version](https://img.shields.io/docker/v/voidauth/voidauth?sort=semver&logo=docker&logoColor=white)
![Docker Pulls](https://img.shields.io/docker/pulls/voidauth/voidauth?logo=docker&logoColor=white)


<p align="center">
  <img src="https://raw.githubusercontent.com/voidauth/voidauth/refs/heads/main/frontend/public/logo.svg" width="150" title="VoidAuth" alt="VoidAuth logo">
</p>

<p align="center">
The Single Sign-On Provider that makes securing your applications and resources easy.
</p>
<br>

<p align="center">
  <img src="https://raw.githubusercontent.com/voidauth/voidauth/refs/heads/main/docs/public/login_portal.png" width="200">
</p>

## What is VoidAuth
VoidAuth is an open-source authentication platform designed to simplify user management and securing access to your self-hosted applications and resources.

Key Features:

- 🙋‍♂️ User Management
- 🌐 OpenID Connect (OIDC) Provider
- 🔀 Proxy ForwardAuth Domains
- 📧 User Registration and Invitations
- 🔑 Passkey Support
- 🔐 Secure Password Reset with Email Verification
- 🎨 Custom Branding Options

### Why Choose VoidAuth?

- Simplicity. An intuitive web interface for end-users and administrators.
- Flexibility. Easily customize your login page with your own logo, app title, and theme colors.
- Modern Authentication. Support for cutting-edge authentication methods like passkeys, password complexity rules.
- Self-Hosted. Take complete control of your authentication.

## Getting Started

Getting started with VoidAuth is straightforward, with just a few lines of Docker Compose you can have it up and running.
``` yaml
services:
  # ---------------------------------
  # Your reverse-proxy service here:
  # caddy, traefik, nginx, etc.
  # ---------------------------------

  voidauth: 
    image: voidauth/voidauth:latest
    volumes:
      - config:/app/config
    environment:
      # Required environment variables
      APP_URL: # required
      STORAGE_KEY: # required
      DB_PASSWORD: # required
      DB_HOST: voidauth-db # required, should probably be the same as the db service name
    depends_on:
      - voidauth-db

  voidauth-db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: # required
    volumes:
      - db:/var/lib/postgresql/data

volumes:
  config:
  db:
```

Please see the [Getting Started](https://voidauth.app/#/Getting-Started) page for details and configuration options.

## Disclaimer

I am not a security researcher or expert, just a developer unsatisfied with the difficult onboarding process of existing selfhosted auth solutions. Use at your own risk.

## Credits

This project would not be possible without the incredible work of others including but not limited to:

[node-oidc-provider](https://github.com/panva/node-oidc-provider) Handles VoidAuth OIDC Provider functionality

[SimpleWebAuthn](https://github.com/MasterKale/SimpleWebAuthn) Used by VoidAuth for webauthn/passkey support

[Angular](https://angular.dev) Frontend web framework used by VoidAuth

[authelia](https://www.authelia.com/) An amazing project and heavy inspiration, VoidAuth aims to be less feature-complete but more user friendly

[lldap](https://github.com/lldap/lldap) Inspiration for user management, a very good selfhosted ldap service
