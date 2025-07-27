# Getting Started

## Initial Setup
VoidAuth currently only supports setup through docker. The container image expects a mounted volume for configuration, and a postgres database connection. There are additional required environment variables listed in the example below, a simple Docker Compose setup:

```yaml

services:
  # ---------------------------------
  # Your reverse-proxy service here:
  # caddy, traefik, nginx, etc.
  # ---------------------------------

  voidauth: 
    image: voidauth/voidauth:latest
    volumes:
      - config:/app/config
    # you may not need this external port mapping, map VoidAuth through your reverse-proxy
    ports:
      - "3000:3000"
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

> [!WARNING]
> VoidAuth does **NOT** provide https termination itself, but it is absolutely **required**. This likely means you will need a reverse-proxy with https support in front of VoidAuth, as well as your other services.

> [!WARNING]
> The **APP_URL** environment variable **must** be set to the external url of the VoidAuth service for the OIDC Provider to work properly, ex. `APP_URL: https://auth.example.com`

> [!CAUTION]
> During the first start of the app, the **initial admin username and password** will be shown in the logs. They will never be shown again. You will need to note them down and use them to create a user for yourself, which you should add to the **auth_admins** group. Afterwards you may delete the **auth_admin** user.

> [!IMPORTANT]
> Any user in the **auth_admins** group will be an administrator in VoidAuth and have access to the admin pages. Do not give this security group to any user you do not want to have full privileges in VoidAuth, you should probably make a different group for administrators of protected domains/apps.

## Configuration
### Environment Variables
VoidAuth is configurable primarily by environment variable. The available environment variables and their defaults are listed in the table below:

#### App Settings
| Name | Default | Description | Required | Recommended |
| :------ | :-- | :-------- | :--- | :--- |
| APP_URL | | URL VoidAuth will be served on. Must start with`https://`  Example: `https://auth.example.com` | 🔴 | |
| DEFAULT_REDIRECT | ${APP_URL} | The home/landing/app url for your domain. This is where users will be redirected upon accepting an invitation, logout, or clicking the logo when already on the auth home page. | | ✅ |
| SIGNUP | false | Whether the app allows new users to self-register themselves without invitation. | | |
| SIGNUP_REQUIRES_APPROVAL | true | Whether new users who register themselves require approval by an admin. Setting this to **false** while **SIGNUP** is **true** enables open self-registration; use with caution! | | |
| EMAIL_VERIFICATION | false | If true, users who set or change their email address will get a verification email before it can be used. If you are using an email provider, this should be set to true. | | ✅ (If SMTP Settings are set) |

#### App Customization
| Name | Default | Description | Required | Recommended |
| :------ | :-- | :-------- | :--- | :--- |
| APP_TITLE | VoidAuth | Title that will show on the web interface, use your own brand/app/title. | | ✅ |
| APP_PORT | 3000 | The port that app will listen on. | | |
| APP_COLOR | #906bc7 | Theme color, rgb format; ex. #xxyyzz | | ✅ |
| CONTACT_EMAIL | | The email address used for 'Contact Us' links, which are shown on most end-user pages if this is set. | | |

#### DB Settings
| Name | Default | Description | Required | Recommended |
| :------ | :-- | :-------- | :--- | :--- |
| DB_HOST | | Host address of the database. | 🔴 | |
| DB_PASSWORD | | Password of the database. If you do not enter one VoidAuth will recommend one to you. | 🔴 | |
| DB_PORT | 5432 | Port of the database. | | |
| DB_USER | postgres | Username used to sign into the database by the app. | | |
| DB_NAME | postgres | Database name used to connect to the database by the app. | | |
| STORAGE_KEY | | Storage encryption key for secret values such as keys and client secrets. Must be at least 32 characters long and should be randomly generated. If you do not enter one VoidAuth will recommend one to you. | 🔴 | |
| STORAGE_KEY_SECONDARY | | Secondary storage encryption key, used when rotating the primary storage encryption key. | | |


#### SMTP Settings
All of these settings are ✅ recommended to be set to the correct values for your email provider.

| Name | Default | Description |
| :------ | :-- | :-------- |
| SMTP_HOST | | SMTP Host; ex. `mail.example.com` |
| SMTP_FROM | | SMTP From field; ex.`My App<app@example.com>` |
| SMTP_PORT | 587 | SMTP port to use. |
| SMTP_SECURE | false | SMTP has TLS/SSL enabled. |
| SMTP_USER | | SMTP username used to sign into email provider; ex `user@example.com` |
| SMTP_PASS | | SMTP password used to sign into email provider |

#### Misc.
| Name | Default | Description | Required | Recommended |
| :------ | :-- | :-------- | :--- | :--- |
| PASSWORD_STRENGTH | 3 | The minimum strength of users passwords, at least 3 is recommended. Must be between 0 - 4. | | |
| ADMIN_EMAILS | hourly | The minimum duration between admin notification emails. Can be set to values like: '4 hours', '30 minutes', 'weekly', 'daily', etc. If set to 'false', admin notification emails are disabled. | | | 

> [!IMPORTANT]
> Some configuration options only make sense when used together. **EMAIL_VERIFICATION** should only be set if the **SMTP_** options are also set. Likewise, **SIGNUP_REQUIRES_APPROVAL** does nothing unless **SIGNUP** is set.

### Config Directory
Your own branding can be applied to the app by mounting the **/app/config** directory and adding files or modifying the existing files.

The logo and favicon of the web interface can be customized by placing your own **logo.svg**/**logo.png** and **favicon.svg**/**favicon.png** in the mounted **/app/config/branding** directory. You can also add an **apple-touch-icon.png** file to **/app/config/branding**.

The email templates for email verification, invitations, and password resets can be changed by modifying the files in the **/app/config/email_templates** directory. The files are [pug](https://pugjs.org/api/getting-started.html) template format and text, which should be updated together when changed. To reset your changes to the email templates, just delete (or move) your **/app/config/email_templates** directory and it will be regenerated on app restart.

### Customization
> [!IMPORTANT]
> There are enough branding options between environment variables like **APP_TITLE**, **APP_COLOR**, and config directory customization to remove any end-user reference to VoidAuth branding. You can make it your own! Below is an example of some theming changes and light mode enabled:
>
> <img width="260" src="/public/screenshots/66152d9b-b041-4374-91ec-4363ab1cb064.png" />

### Authentication
To start setting up protected applications, there are two options available. If the application supports OIDC integration you can follow the instructions in the [OIDC Setup](OIDC-Setup.md) guide. If the application does not support OIDC or you want to secure a domain or resource you should follow the [ProxyAuth](ProxyAuth-and-Trusted-Header-SSO-Setup.md) guide.

## Experimental
> [!WARNING]
> The following configurations are not well supported or tested, but may cover additional use-cases.
### Multi-Domain Protection
You can secure multiple domains you own by running multiple instances of VoidAuth using the same database. They should have the same **STORAGE_KEY** and **DB_\*** variables, but may otherwise have completely different configurations. The **APP_URL** variables of each would cover a different domain. If the domains you were trying to secure were `example.com` and `your-domain.net` you might set the **APP_URL** variables like `https://auth.example.com` and `https://id.your-domain.net`. These two instances would share everything in the shared DB, including users, OIDC clients, ProxyAuth Domains, etc.

