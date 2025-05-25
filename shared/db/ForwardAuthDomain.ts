import type { Audit } from "./Audit"

export type ForwardAuthDomain = Audit & {
  id: string
  domain: string
}
