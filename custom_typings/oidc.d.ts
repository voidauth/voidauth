declare module 'oidc-provider/lib/helpers/weak_cache' {
  function instance(provider: import('oidc-provider').Provider): {
    clientAdd: (metadata: import('oidc-provider').ClientMetadata, {
      ctx: any,
      store: boolean
    }) => Client
    clientRemove: (clientId: string) => Client
  }

  export default instance
}