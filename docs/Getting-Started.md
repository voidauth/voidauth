# Getting Started

## Initial Setup
VoidAuth currently only supports setup through docker. The container image expects a mounted volume for configuration, and either a postgres database connection or mounted volume for a SQLite database. There are additional required environment variables listed in the example below, a simple Docker Compose setup using a postgres database:

```yaml
services:
  # ---------------------------------
  # Your reverse-proxy service here:
  # caddy, traefik, nginx, etc.
  # https:// setup is highly recommended
  # ---------------------------------

  voidauth: 
    image: voidauth/voidauth:latest
    restart: unless-stopped
    volumes:
      - ./voidauth/config:/app/config
    ports:
      - "3000:3000" # may not be needed, depending on reverse-proxy setup
    environment:
      # Required environment variables
      APP_URL: # required, ex. https://auth.example.com
      STORAGE_KEY: # required
      DB_PASSWORD: # required
      DB_HOST: voidauth-db # required
    depends_on:
      voidauth-db:
        condition: service_healthy

  voidauth-db:
    image: postgres:18
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: # required
    volumes:
      - db:/var/lib/postgresql/18/docker
    healthcheck:
      test: "pg_isready -U postgres -h localhost"

volumes:
  db:
```

Below is an alternate Docker Compose setup using a SQLite database:

```yaml
services:
  # ---------------------------------
  # Your reverse-proxy service here:
  # caddy, traefik, nginx, etc.
  # https:// setup is highly recommended
  # ---------------------------------

  voidauth: 
    image: voidauth/voidauth:latest
    restart: unless-stopped
    volumes:
      - ./voidauth/config:/app/config
      - ./voidauth/db:/app/db
    ports:
      - "3000:3000" # may not be needed, depending on reverse-proxy setup
    environment:
      # Required environment variables
      APP_URL: # required, ex. https://auth.example.com
      STORAGE_KEY: # required
      DB_ADAPTER: sqlite

```

> [!TIP]
> A VoidAuth bind mount for `/app/config` as shown above is recommended to enable logo and email template customization.

> [!WARNING]
> VoidAuth does **NOT** provide `https:` termination itself, but it is **highly recommended**. This means you will need a reverse-proxy with `https:` support in front of VoidAuth and your other services, and some method of acquiring certificates (many reverse-proxies handle this as well).

> [!WARNING]
> The **APP_URL** environment variable **must** be set to the full external url of the VoidAuth service, ex. `APP_URL: https://auth.example.com` or `APP_URL: https://example.com/auth`

> [!CAUTION]
> During the first start of the app, the **initial admin username and password** will be shown in the logs. They will never be shown again. You will need to note them down and either change the username and password or create a user for yourself, which you should add to the **auth_admins** group. Afterwards you may delete the **auth_admin** user.

> [!IMPORTANT]
> Any user in the **auth_admins** group will be an administrator in VoidAuth. You should make a different group for administrators of protected domains/apps.

## Configuration

### Users and Apps

User and Client App (OIDC Client or ProxyAuth Domain) management is performed in the web interface. You can view the documentation on user management on the [User Management](User-Management.md) page.

To start setting up protected applications, there are two options available. If the application supports OIDC integration you can follow the instructions in the [OIDC Setup](OIDC-Setup.md) guide. If the application does not support OIDC or you just want to secure a specific path, you should follow the [ProxyAuth](ProxyAuth-and-Trusted-Header-SSO-Setup.md) guide.

### Environment Variables
VoidAuth is configurable primarily by environment variable. The available environment variables and their defaults are listed in the table below:

#### App Settings
| Name | Default | Description | Required | Recommended |
| :------ | :-- | :-------- | :--- | :--- |
| APP_URL | | URL of the web interface. ex. `https://auth.example.com` or `https://example.com/auth` | 🔴 | |
| STORAGE_KEY | | Storage encryption key for secret values such as keys and client secrets. Must be at least 32 characters long and should be randomly generated. If you do not enter one VoidAuth will recommend one to you. | 🔴 | |
| STORAGE_KEY_SECONDARY | | Secondary storage encryption key, used when rotating the primary storage encryption key. | | |
| SESSION_DOMAIN | `${APP_URL}` Base Domain | Domain of the VoidAuth Session Cookie. This is automatically set to the Base Domain of `${APP_URL}` but may be overridden here. Must be equal to or a higher level domain than `${APP_URL}` | | |
| DEFAULT_REDIRECT | `${APP_URL}` | The home/landing/app url for your domain. This is where users will be redirected upon accepting an invitation, logout, or clicking the header logo when already on the auth home page. | | ✅ |
| SIGNUP | `false` | Whether the app allows new users to self-register themselves without invitation. | | |
| SIGNUP_REQUIRES_APPROVAL | `true` | Whether new users who register themselves require approval by an admin. Setting this to **false** while **SIGNUP** is **true** enables open self-registration; use with caution! | | |
| EMAIL_VERIFICATION | `true` if SMTP_HOST is set, otherwise `false` | If true, users must have an email address and will get a verification email when changing their email address before it can be used. If you are using an email provider, this should probably be `true`. | | |
| MFA_REQUIRED | `false` | If true, users must use a second security factor while logging in such as an Authenticator Token or Passkey | | |
| API_RATELIMIT  | `60` | Rate Limit for mutating (state-changing) requests per minute per IP address. Default is `60`, one per second. | | |
| ENABLE_DEBUG  | `false` | Enables debug logging. WARNING! This will cause the activity of users to be printed in the logs.  | | |

#### App Customization
| Name | Default | Description | Required | Recommended |
| :------ | :-- | :-------- | :--- | :--- |
| APP_TITLE | `VoidAuth` | Title that will show on the web interface, use your own brand/app/title. | | ✅ |
| APP_PORT | `3000` | The port that app will listen on. | | |
| APP_COLOR | `#906bc7` | Theme color, rgb format; ex. #xxyyzz | | ✅ |
| APP_FONT | `monospace` | Font used in the web interface and sent emails. Safe fonts should be used, if a font is missing it will fallback to default. Multiple font families may be chosen in fallback-font format. ex. `APP_FONT: "Tahoma, Verdana, sans-serif"` | | |
| CONTACT_EMAIL | | The email address used for 'Contact' links, which are shown on most end-user pages if this is set. | | |

#### Database Settings
When using the `sqlite` database adapter type, no additional database connection variables are required. You will need a mounted volume to hold the generated `db.sqlite` file, as shown in the SQLite docker compose example above.

| Name | Default | Description | Required | Recommended |
| :------ | :-- | :-------- | :--- | :--- |
| DB_ADAPTER | `postgres` | Allowed values are `postgres` and `sqlite`. | | |
| DB_HOST | | Host address of the database. | 🔴 (unless using SQLite database) | |
| DB_PASSWORD | | Password of the database. If you do not enter one VoidAuth will recommend one to you. | 🔴 (unless using SQLite database) | |
| DB_PORT | `5432` | Port of the database. Not used if using SQLite database. | | |
| DB_USER | `postgres` | Username used to sign into the database by the app. Not used if using SQLite database. | | |
| DB_NAME | `postgres` | Database name used to connect to the database by the app. Not used if using SQLite database. | | |

#### Database Migration Settings
Use the following environment variables to configure a database migration. These variables *exactly* mirror the `DB_*` environment variables and describe the connection to be made to the new database. See details on how to migrate an existing database to a new one on the [Database Migration](DB-Migration.md) page.

| Name | Default | Description | Required | Recommended |
| :------ | :-- | :-------- | :--- | :--- |
| MIGRATE_TO_DB_ADAPTER | `postgres` | Allowed values are `postgres` and `sqlite`. | | |
| MIGRATE_TO_DB_HOST | | Host address of the database. | 🔴 (unless migrating to SQLite database) | |
| MIGRATE_TO_DB_PASSWORD | | Password of the database. If you do not enter one VoidAuth will recommend one to you. | 🔴 (unless migrating to SQLite database) | |
| MIGRATE_TO_DB_PORT | `5432` | Port of the database. Not used if migrating to SQLite database. | | |
| MIGRATE_TO_DB_USER | `postgres` | Username used to sign into the database by the app. Not used if migrating to SQLite database. | | |
| MIGRATE_TO_DB_NAME | `postgres` | Database name used to connect to the database by the app. Not used if migrating to SQLite database. | | |

#### SMTP Settings
All of these settings are ✅ recommended to be set to the correct values for your email provider.

| Name | Default | Description |
| :------ | :-- | :-------- |
| SMTP_HOST | | SMTP Host; ex. `mail.example.com` |
| SMTP_FROM | | SMTP From field. Can be plain `'app@example.com'` or formatted `'"My App" <app@example.com>'`. Ensure the string is properly formatted for your chosen deployment method, or emails may silently fail to be delivered. |
| SMTP_PORT | `587` | SMTP port to use. |
| SMTP_SECURE | `false` | SMTP has TLS/SSL enabled. |
| SMTP_USER | | SMTP username used to sign into email provider; ex `user@example.com` |
| SMTP_PASS | | SMTP password used to sign into email provider |
| SMTP_IGNORE_CERT | `false` | SMTP Connection will ignore invalid and self-signed certificates from SMTP providers |

#### Misc.
| Name | Default | Description | Required | Recommended |
| :------ | :-- | :-------- | :--- | :--- |
| PASSWORD_STRENGTH | `3` | The minimum strength of users passwords, at least 3 is recommended. Must be between 0 - 4. | | |
| ADMIN_EMAILS | `hourly` | The minimum duration between admin notification emails. Can be set to values like: '4 hours', '30 minutes', 'weekly', 'daily', etc. If set to 'false', admin notification emails are disabled. | | | 

> [!IMPORTANT]
> Some configuration options only make sense when used together. **EMAIL_VERIFICATION** should only be set if the **SMTP_** options are also set. Likewise, **SIGNUP_REQUIRES_APPROVAL** does nothing unless **SIGNUP** is set.

### Config Directory
Your own branding can be applied to the app by mounting the **/app/config** directory and adding files or modifying the existing files.

The logo and favicon of the web interface can be customized by placing your own **logo.svg**/**logo.png** and **favicon.svg**/**favicon.png** in the mounted **/app/config/branding** directory. You can also add an **apple-touch-icon.png** file to **/app/config/branding**.

For information on how to change the email templates used for invitations, password resets, email verification, etc. see the documentation page for [Email Templates](Email-Templates.md).

### Customization
> [!IMPORTANT]
> There are enough branding options between environment variables like **APP_TITLE**, **APP_COLOR**, and config directory customization to remove any end-user reference to VoidAuth branding. You can make it your own! Below is an example of some theming changes and light mode enabled:
>
> <img width="260" src="/public/screenshots/66152d9b-b041-4374-91ec-4363ab1cb064.png" />

## Experimental
> [!WARNING]
> The following configurations are not well supported or tested, but may cover additional use-cases.

### Multi-Domain Protection
You can secure multiple domains you own by running multiple instances of VoidAuth using the same database. They should have the same **STORAGE_KEY** and **DB_\*** variables, but may otherwise have completely different configurations. The **APP_URL** variables of each would cover a different domain. If the domains you were trying to secure were `example.com` and `your-domain.net` you might set the **APP_URL** variables like `https://auth.example.com` and `https://id.your-domain.net`. These two instances would share everything in the shared DB, including users, OIDC clients, ProxyAuth Domains, etc.

