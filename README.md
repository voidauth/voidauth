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
  <img src="https://raw.githubusercontent.com/voidauth/voidauth/refs/heads/main/docs/public/screenshots/2f8c15db-28fd-4b0e-a266-1dddd9cf9e3a.png" width="240">
</p>

## What is VoidAuth

VoidAuth is an open-source authentication platform that streamlines user management and access control for self-hosted applications. Centered on OpenID Connect (OIDC) integration, it also offers first class support for Proxy ForwardAuth (ProxyAuth) to provide a full authentication solution. Combined with a focus on an intuitive end-user and administrator web interface, VoidAuth provides a seamless and professional authentication experience.

Key Features:

- User Management
- OpenID Connect (OIDC) Provider
- Proxy ForwardAuth Domains
- User Self-Registration and Invitations
- Custom Branding Options (Logo, Title, Theme Color, Email Templates)
- Passkey Support
- Secure Password Reset with Email Verification
- Encryption-At-Rest

## User Profile Settings

The default page for users logging into VoidAuth, on the Profile Settings page a user can manage their profile, password, email, and passkey settings.

<p align="center">
  <img src="https://raw.githubusercontent.com/voidauth/voidauth/refs/heads/main/docs/public/screenshots/091a0122-75d7-44d0-9c97-e395c945cf4f.png" width="240">
</p>

## Admin Panel

Administrators can access the Admin Panel in the sidebar menu, where they can manage the authentication settings of the VoidAuth instance.

<p align="center">
  <img src="https://raw.githubusercontent.com/voidauth/voidauth/refs/heads/main/docs/public/screenshots/admin_panel.png" width="600">
</p>

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
      DB_HOST: voidauth-db # required
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

After VoidAuth starts for the first time, find the initial administrator username and password in the logs: `docker compose logs voidauth`

Please see the [Getting Started](https://voidauth.app/#/Getting-Started) page for details and configuration options.

## Support

Issues, Suggestions, and Feature Requests should be added as [Issues](https://github.com/voidauth/voidauth/issues) of the appropriate type. For Help and Support, Q&A, or anything else; open a [Discussion](https://github.com/orgs/voidauth/discussions). This project is actively monitored, I will likely respond quickly.

## Disclaimer

I am not a security researcher or expert, just a developer unsatisfied with the difficult onboarding process of existing self-hosted auth solutions. Use at your own risk.

## Credits

This project would not be possible without the incredible work of others including but not limited to:

[node-oidc-provider](https://github.com/panva/node-oidc-provider) Handles VoidAuth OIDC Provider functionality

[SimpleWebAuthn](https://github.com/MasterKale/SimpleWebAuthn) Used by VoidAuth for webauthn/passkey support

[Angular](https://angular.dev) Frontend web framework used by VoidAuth

[authelia](https://www.authelia.com/) An amazing project and heavy inspiration, VoidAuth aims to be less feature-complete but more user friendly

[lldap](https://github.com/lldap/lldap) Inspiration for user management, a very good self-hosted ldap service
