import assert from 'assert'
import instance from 'oidc-provider/lib/helpers/weak_cache'
import { provider } from '../server/oidc/provider'
import initialize from 'oidc-provider/lib/helpers/initialize_keystore'

assert.ok(instance, 'oidc-provider/lib/helpers/weak_cache instance does not exist.')
assert.ok(instance(provider).clientAdd, 'oidc-provider/lib/helpers/weak_cache instance().clientAdd does not exist.')
assert.ok(instance(provider).clientRemove,
  'oidc-provider/lib/helpers/weak_cache instance().clientRemove does not exist.')

assert.ok(initialize, 'oidc-provider/lib/helpers/initialize_keystore initialize does not exist')
