declare module 'oidc-provider/lib/helpers/weak_cache' {
  function instance(provider: import('oidc-provider').Provider): {
    clientAdd: (metadata: import('oidc-provider').ClientMetadata, {
      ctx: unknown,
      store: boolean,
    }) => Promise<import('oidc-provider').Client>
    clientRemove: (clientId: string) => Promise<import('oidc-provider').Client>
  }

  export default instance
}
