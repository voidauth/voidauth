# VoidAuth

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/voidauth/voidauth/release.yml) ![GitHub Release](https://img.shields.io/github/v/release/voidauth/voidauth?logo=github)
![Docker Image Version](https://img.shields.io/docker/v/voidauth/voidauth?sort=semver&logo=docker)




<p align="center">
  <img src="https://raw.githubusercontent.com/voidauth/voidauth/refs/heads/main/frontend/public/logo.svg" width="150" title="VoidAuth" alt="VoidAuth logo">
</p>

<p align="center">
The Single Sign-On Provider that makes securing your applications and resources easy.
</p>
<br>

<p align="center">
  <img src="https://raw.githubusercontent.com/voidauth/voidauth/refs/heads/main/docs/login_portal.png" width="200">
</p>

## Features

* User Management
* OIDC Provider
* Proxy ForwardAuth Domains
* Invitations
* Passkey Support
* Password Reset with Email Address Verification
* Custom Branding and CSS

VoidAuth is accessed through an easy to use web interface that makes user sign-in and domain management simple. The web app also has a configurable app title, logo, and theme color so you can make your sign-in page match your brand.

## Getting Started

Please see the [wiki](https://github.com/voidauth/voidauth/wiki/Getting-Started) for documentation, a quick start docker compose.yml might look like this:
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

## Roadmap

| Item  | Status |
| ----- | ------ |
| Docs  | In Progress... |

## Disclaimer

I am not a security researcher or expert, just a developer unsatisfied with the difficult onboarding process of existing selfhosted auth solutions. Use at your own risk.

## Credits

[node-oidc-provider](https://github.com/panva/node-oidc-provider) Handles VoidAuth OIDC Provider functionality

[SimpleWebAuthn](https://github.com/MasterKale/SimpleWebAuthn) Used by VoidAuth for webauthn/passkey support

[Angular](https://angular.dev) Frontend web framework used by VoidAuth

[authelia](https://www.authelia.com/) An amazing project and heavy inspiration, VoidAuth aims to be less feature-complete but more user friendly

[lldap](https://github.com/lldap/lldap) Inspiration for user management, a very good selfhosted ldap service
