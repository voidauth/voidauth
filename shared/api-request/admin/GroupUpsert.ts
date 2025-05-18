import type { Group } from "@shared/db/Group"

export type GroupUpsert = Partial<Pick<Group, "id">> & Pick<Group, "name">
