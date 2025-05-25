import type { Audit } from "./Audit"

export type ProxyAuth = Audit & {
  id: string
  domain: string
}
