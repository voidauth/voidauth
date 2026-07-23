declare module 'oidc-provider/lib/helpers/add_client.js' {
  export default async function add(
    provider: import('oidc-provider').Provider,
    metadata: import('oidc-provider').ClientMetadata, {
      ctx: never,
      store: boolean,
    }): Promise<import('oidc-provider').Client>
}
