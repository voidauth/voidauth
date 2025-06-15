import type { Group } from "@shared/db/Group"
import type { ProxyAuth } from "@shared/db/ProxyAuth"

export type ProxyAuthUpsert = Partial<Pick<ProxyAuth, "id">> & Pick<ProxyAuth, "domain"> & {
  groups: Group["name"][]
}
