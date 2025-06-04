import { Router, type Request, type Response } from "express"
import { validate, type TypedSchema } from "../util/validate"
import { commit, createTransaction, db, rollback } from "../db/db"
import { matchedData } from "express-validator"
import { provider } from "../oidc/provider"
import { GRANT_TYPES, RESPONSE_TYPES, type ClientUpsert } from "@shared/api-request/admin/ClientUpsert"
import type { User } from "@shared/db/User"
import { randomUUID } from "crypto"
import {
  checkAdmin, checkLoggedIn, emailValidation,
  nameValidation, stringValidation, usernameValidation, uuidValidation,
} from "../util/validators"
import { getClient, getClients, removeClient, upsertClient } from "../db/client"
import type { UserGroup, Group, InvitationGroup } from "@shared/db/Group"
import type { GroupUpsert } from "@shared/api-request/admin/GroupUpsert"
import { ADMIN_GROUP, TTLs } from "@shared/constants"
import type { UserUpdate } from "@shared/api-request/admin/UserUpdate"
import { getUserById, getUsers } from "../db/user"
import { createExpiration, mergeKeys } from "../db/util"
import type { UserDetails, UserWithoutPassword } from "@shared/api-response/UserDetails"
import { getInvitation, getInvitations } from "../db/invitations"
import type { Invitation } from "@shared/db/Invitation"
import type { InvitationUpsert } from "@shared/api-request/admin/InvitationUpsert"
import { sendInvitation } from "../util/email"
import { generate } from "generate-password"
import type { GroupUsers } from "@shared/api-response/admin/GroupUsers"

const clientMetadataValidator: TypedSchema<ClientUpsert> = {
  client_id: {
    ...stringValidation,
    isLength: {
      options: {
        min: 1,
      },
    },
  },
  redirect_uris: {
    isArray: true,
  },
  "redirect_uris.*": {
    isURL: {
      options: {
        protocols: ["http", "https"],
        require_tld: false,
        require_protocol: true,
      },
    },
    trim: true,
  },
  client_secret: {
    ...stringValidation,
    isLength: {
      options: {
        min: 1,
      },
    },
  },
  token_endpoint_auth_method: {
    optional: true,
    ...stringValidation,
  },
  response_types: {
    isArray: true,
  },
  "response_types.*": {
    ...stringValidation,
    isIn: {
      options: [RESPONSE_TYPES],
    },
  },
  grant_types: {
    isArray: true,
  },
  "grant_types.*": {
    ...stringValidation,
    isIn: {
      options: [GRANT_TYPES],
    },
  },
  skip_consent: {
    default: {
      options: false,
    },
    isBoolean: true,
  },
  logo_uri: {
    default: {
      options: undefined,
    },
    optional: true,
    isURL: {
      options: {
        protocols: ["http", "https"],
        require_tld: false,
        require_protocol: true,
      },
    },
    trim: true,
  },
}

export const adminRouter = Router()

adminRouter.use(checkLoggedIn, checkAdmin)

adminRouter.get("/clients", async (_req, res) => {
  const clients = await getClients()
  res.send(clients)
})

adminRouter.get("/client/:client_id",
  ...validate<{ client_id: string }>({
    client_id: stringValidation,
  }), async (req: Request, res: Response) => {
    const { client_id } = matchedData<{ client_id: string }>(req, { includeOptionals: true })
    const client = await getClient(client_id)
    if (client) {
      res.send(client)
    } else {
      res.sendStatus(404)
    }
  },
)

/**
 * Because client_id is primary and user-defined,
 * POST must always create a new client and PATCH must update an existing client
 */

adminRouter.post("/client",
  ...validate<ClientUpsert>(clientMetadataValidator),
  async (req: Request, res: Response) => {
    const clientMetadata = matchedData<ClientUpsert>(req, { includeOptionals: true })
    try {
      // check that existing client does not exist with client_id
      const existingClient = await getClient(clientMetadata.client_id)
      if (existingClient) {
        res.sendStatus(409)
        return
      }

      await upsertClient(provider, clientMetadata, provider.createContext(req, res))
      res.send()
    } catch (e) {
      console.error(e)
      res.status(400).send({ message: e })
    }
  },
)

adminRouter.patch("/client",
  ...validate<ClientUpsert>(clientMetadataValidator),
  async (req: Request, res: Response) => {
    const clientMetadata = matchedData<ClientUpsert>(req, { includeOptionals: true })
    try {
      // check that existing client exists with client_id
      const existingClient = await getClient(clientMetadata.client_id)
      if (!existingClient) {
        res.sendStatus(404)
        return
      }

      await upsertClient(provider, clientMetadata, provider.createContext(req, res))
      res.send()
    } catch (e) {
      console.error(e)
      res.status(400).send({ message: e })
    }
  },
)

adminRouter.delete("/client/:client_id",
  ...validate<{ client_id: string }>({
    client_id: stringValidation,
  }), async (req: Request, res: Response) => {
    const { client_id } = matchedData<{ client_id: string }>(req, { includeOptionals: true })
    const client = await getClient(client_id)
    if (!client) {
      res.sendStatus(404)
      return
    }
    await removeClient(client_id)
    res.send()
  },
)

adminRouter.get("/users", async (_req, res) => {
  const users: UserWithoutPassword[] = await getUsers()
  res.send(users)
})

adminRouter.get("/user/:id",
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req: Request, res: Response) => {
    const { id } = matchedData<{ id: string }>(req, { includeOptionals: true })
    const user = await getUserById(id)
    if (!user) {
      res.sendStatus(404)
      return
    }

    const groups = await db().select("name")
      .table<Group>("group")
      .innerJoin<UserGroup>("user_group", "user_group.groupId", "group.id").where({ userId: id })
      .orderBy("name", "asc")
    const { passwordHash, ...userWithoutPassword } = user
    const userResponse: UserDetails = { ...userWithoutPassword, groups: groups.map(g => g.name) }

    res.send(userResponse)
  },
)

adminRouter.patch("/user",
  ...validate<UserUpdate>({
    id: uuidValidation,
    username: usernameValidation,
    name: nameValidation,
    email: {
      default: {
        options: null,
      },
      optional: {
        options: {
          values: "null",
        },
      },
      ...emailValidation,
    },
    emailVerified: {
      isBoolean: true,
    },
    approved: {
      isBoolean: true,
    },
    groups: {
      isArray: true,
    },
    "groups.*": stringValidation,
  }),
  async (req: Request, res: Response) => {
    await createTransaction()
    try {
      const userUpdate = matchedData<UserUpdate>(req, { includeOptionals: true })

      const { groups: _, ...user } = userUpdate
      const ucount = await db().table<User>("user").update(user).where({ id: userUpdate.id })
      const groups: Group[] = await db().select().table<Group>("group").whereIn("name", userUpdate.groups)
      const userGroups: UserGroup[] = groups.map((g) => {
        return {
          groupId: g.id,
          userId: userUpdate.id,
          createdBy: req.user.id,
          updatedBy: req.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      })

      if (userGroups[0]) {
        await db().table<UserGroup>("user_group").insert(userGroups)
          .onConflict(["groupId", "userId"]).merge(mergeKeys(userGroups[0]))
      }

      await db().table<UserGroup>("user_group").delete()
        .where({ userId: userUpdate.id }).and
        .whereNotIn("groupId", userGroups.map(g => g.groupId))

      if (!ucount) {
        res.sendStatus(404)
        return
      }

      await commit()
      res.send()
    } catch (e) {
      await rollback()
      throw e
    }
  },
)

adminRouter.delete("/user/:id",
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req: Request, res: Response) => {
    const { id } = matchedData<{ id: string }>(req, { includeOptionals: true })

    if (req.user.id === id) {
      res.sendStatus(400)
      return
    }

    const count = await db().table<User>("user").delete().where({ id })

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  },
)

adminRouter.get("/groups", async (_req, res) => {
  const groups = await db().select().table<Group>("group").orderBy("id", "asc")
  res.send(groups)
})

adminRouter.get("/group/:id",
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req: Request, res: Response) => {
    const { id } = matchedData<{ id: string }>(req, { includeOptionals: true })
    const group = await db().select().table<Group>("group").where({ id }).first()

    if (!group) {
      res.sendStatus(404)
      return
    }

    const groupWithUsers: GroupUsers = {
      ...group,
      users: await db().select("id", "username")
        .table<User>("user")
        .innerJoin<UserGroup>("user_group", "user_group.userId", "user.id")
        .where({ groupId: group.id }).orderBy("id", "asc"),
    }

    res.send(groupWithUsers)
  },
)

adminRouter.post("/group",
  ...validate<GroupUpsert>({
    id: {
      optional: {
        options: {
          values: "null",
        },
      },
      ...uuidValidation,
    },
    name: stringValidation,
    users: {
      isArray: true,
    },
    "users.*.id": uuidValidation,
    "users.*.username": { // we aren't going to use this
      optional: {
        options: {
          values: "falsy",
        },
      },
    },
  }),
  async (req: Request, res: Response) => {
    const { id, name, users } = matchedData<GroupUpsert>(req, { includeOptionals: true })

    // Check for name conflict
    const conflictingGroup = await db().select()
      .table<Group>("group")
      .whereRaw("lower(\"name\") = lower(?)", [name])
      .first()
    if (conflictingGroup && conflictingGroup.id !== id) {
      res.sendStatus(409)
      return
    }

    const groupId = id ?? randomUUID()

    // Do not update the ADMIN_GROUP
    if (name.toLowerCase() !== ADMIN_GROUP.toLowerCase()) {
      const group: Group = {
        id: groupId,
        name,
        createdBy: req.user.id,
        updatedBy: req.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      await db().table<Group>("group").insert(group).onConflict(["id"]).merge(mergeKeys(group))
    } else {
      // If this IS the ADMIN_GROUP, there should always be at least one user
      if (!users.length) {
        res.sendStatus(400)
        return
      }
    }

    const userGroups: UserGroup[] = users.map((u) => {
      return {
        userId: u.id,
        groupId: groupId,
        createdBy: req.user.id,
        updatedBy: req.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })

    if (userGroups[0]) {
      await db().table<UserGroup>("user_group").insert(userGroups)
        .onConflict(["groupId", "userId"]).merge(mergeKeys(userGroups[0]))
    }

    await db().table<UserGroup>("user_group").delete()
      .where({ groupId: groupId }).and
      .whereNotIn("userId", userGroups.map(g => g.userId))

    res.send({ id: groupId })
  },
)

adminRouter.delete("/group/:id",
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req: Request, res: Response) => {
    const { id } = matchedData<{ id: string }>(req, { includeOptionals: true })

    const group = await db().select().table<Group>("group").where({ id }).first()
    // Do not delete the admin group
    if (group?.name.toLowerCase() === ADMIN_GROUP.toLowerCase()) {
      res.sendStatus(400)
      return
    }

    await db().table<Group>("group").delete().where({ id })

    res.send()
  },
)

adminRouter.get("/invitations", async (_req, res) => {
  const invitations: Invitation[] = await getInvitations()
  res.send(invitations)
})

adminRouter.get("/invitation/:id",
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req: Request, res: Response) => {
    const { id } = matchedData<{ id: string }>(req, { includeOptionals: true })
    const invitation = await getInvitation(id)
    if (!invitation) {
      res.sendStatus(404)
      return
    }
    res.send(invitation)
  },
)

adminRouter.post("/invitation",
  ...validate<InvitationUpsert>({
    id: {
      optional: {
        options: {
          values: "null",
        },
      },
      ...uuidValidation,
    },
    username: {
      default: {
        options: null,
      },
      optional: {
        options: {
          values: "null",
        },
      },
      ...usernameValidation,
    },
    name: nameValidation,
    email: {
      default: {
        options: null,
      },
      optional: {
        options: {
          values: "null",
        },
      },
      ...emailValidation,
    },
    groups: {
      isArray: true,
    },
    "groups.*": stringValidation,
  }),
  async (req: Request, res: Response) => {
    await createTransaction()
    try {
      const invitationUpsert = matchedData<InvitationUpsert>(req, { includeOptionals: true })
      const { groups: groupNames, ...invitationData } = invitationUpsert

      const id = invitationData.id ?? randomUUID()

      if (invitationData.id) {
        // update
        await db().table<Invitation>("invitation").update({
          ...invitationData,
          createdBy: req.user.id,
          updatedBy: req.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).where({ id: invitationData.id })
      } else {
        // insert
        await db().table<Invitation>("invitation").insert({
          ...invitationData,
          id,
          challenge: generate({
            length: 32,
            numbers: true,
          }),
          createdBy: req.user.id,
          updatedBy: req.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: createExpiration(TTLs.INVITATION),
        })
      }

      const groups: Group[] = await db().select().table<Group>("group").whereIn("name", groupNames)
      const invitationGroups: InvitationGroup[] = groups.map((g) => {
        return {
          groupId: g.id,
          invitationId: id,
          createdBy: req.user.id,
          updatedBy: req.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      })

      if (invitationGroups[0]) {
        await db().table<InvitationGroup>("invitation_group").insert(invitationGroups)
          .onConflict(["groupId", "invitationId"]).merge(mergeKeys(invitationGroups[0]))
      }

      await db().table<InvitationGroup>("invitation_group").delete()
        .where({ invitationId: id }).and
        .whereNotIn("groupId", invitationGroups.map(g => g.groupId))

      const invitation = await getInvitation(id)
      await commit()
      res.send(invitation)
    } catch (e) {
      await rollback()
      throw e
    }
  },
)

adminRouter.delete("/invitation/:id",
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req: Request, res: Response) => {
    const { id } = matchedData<{ id: string }>(req, { includeOptionals: true })

    const count = await db().table<Invitation>("invitation").delete().where({ id })

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  },
)

adminRouter.post("/send_invitation/:id",
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req: Request, res: Response) => {
    const { id } = matchedData<{ id: string }>(req, { includeOptionals: true })
    const invitation = await getInvitation(id)

    if (!invitation) {
      res.sendStatus(404)
      return
    }

    if (!invitation.email) {
      res.sendStatus(400)
      return
    }

    await sendInvitation(invitation, invitation.email)
    res.send()
  },
)
