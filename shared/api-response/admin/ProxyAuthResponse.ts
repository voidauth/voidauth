import type { ProxyAuth } from "@shared/db/ProxyAuth"

export type ProxyAuthResponse = ProxyAuth & {
  groups: string[]
}
