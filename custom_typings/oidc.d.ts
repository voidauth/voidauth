declare module "oidc-provider/lib/helpers/add_client" {
  export default async function add(
    provider: import("oidc-provider").Provider,
    metadata: import("oidc-provider").ClientMetadata, {
      ctx: never,
      store: boolean,
    }): Promise<import("oidc-provider").Client>
}

declare module "oidc-provider/lib/helpers/initialize_keystore" {
  function initialize(jwks: import("oidc-provider").JWKS)

  export default initialize
}
