import type { Configuration } from 'oidc-provider'

let currentProviderConfig: Configuration | undefined = undefined

export function setCurrentProviderConfig(config: Configuration) {
  currentProviderConfig = config
}

export function getCurrentProviderConfig() {
  return currentProviderConfig
}
