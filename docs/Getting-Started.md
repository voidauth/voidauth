# Getting Started

## Initial Setup

### Step 1 - Create Compose File

VoidAuth currently only supports setup through docker. Create a `compose.yaml` file in a directory of your choosing.

The service expects a mounted volume for configuration, and either a postgres database connection or mounted volume for a SQLite database. There are additional required environment variables listed in the example below, a simple Docker Compose setup using a postgres database:

```yaml
services:
  voidauth: 
    image: voidauth/voidauth:latest
    restart: unless-stopped
    volumes:
      - ./voidauth/config:/app/config
      # Only required for declaring OIDC Apps via docker labels (see OIDC-Setup documentation)
      # - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - "3000:3000" # may not be needed, depending on reverse-proxy setup
      # - "3890:3890" # only needed if LDAP Server is enabled
    environment:
      # Required environment variables
      # See https://voidauth.app/#/Getting-Started?id=environment-variables for a list of possible environment variables
      APP_URL: # required
      DB_ADAPTER: postgres # this is the default value
      DB_HOST: voidauth-db # required
      DB_PASSWORD: # required, and must be the same as POSTGRES_PASSWORD in voidauth-db service
      STORAGE_KEY: # required
    depends_on:
      voidauth-db:
        condition: service_healthy

  voidauth-db:
    image: postgres:18
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: # required, and must be the same as DB_PASSWORD in voidauth service
    volumes:
      - ./voidauth/db:/var/lib/postgresql/18/docker
    healthcheck:
      test: "pg_isready -U postgres -h localhost"

```

Below is an alternate Docker Compose setup using a SQLite database:

```yaml
services:
  voidauth: 
    image: voidauth/voidauth:latest
    restart: unless-stopped
    volumes:
      - ./voidauth/config:/app/config
      - ./voidauth/db:/app/db
      # Only required for declaring OIDC Apps via docker labels (see OIDC-Setup documentation)
      # - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - "3000:3000" # may not be needed, depending on reverse-proxy setup
      # - "3890:3890" # only needed if LDAP Server is enabled
    environment:
      # Required environment variables
      # See https://voidauth.app/#/Getting-Started?id=environment-variables for a list of possible environment variables
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


### Step 2 - Run the Service

Start the compose file services by running `docker compose up -d` in the same directory as the `compose.yaml` file.

### Step 3 - Set the Admin Password

During the first start of the app, a **password reset link for the initial admin user** will be shown in the service logs. You can view these logs to retrieve the password reset link with `docker compose logs voidauth`. Copy and paste the link into a browser window, go to your new VoidAuth instance, and set a password for the default admin user.

After signing in as `auth_admin` you can either change the default username or create a user invite for yourself. You can then choose to add your new user to the **auth_admins** group.

> [!IMPORTANT]
> Any user in the **auth_admins** group will be an administrator in VoidAuth. You should make a different group for administrators of protected domains/apps.

## Configuration

See all configuration options including App Settings, Customization, User Management and App Security on the [Configuration](Configuration.md) docs page.
