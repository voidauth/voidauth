import type { DBColumnTypesCheck } from '@shared/db'
import type { Audit } from './Audit'

export type ProxyAuth = Audit & {
  id: string
  domain: string
  mfaRequired: boolean | number
  maxSessionLength: number | null // minutes
}

const _typeCheck: DBColumnTypesCheck<ProxyAuth> = true
