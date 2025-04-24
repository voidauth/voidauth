import { Router, type Request, type Response } from "express"
import { validate, type TypedSchema } from "../util/validate"
import { db } from "../db/db"
import { matchedData } from "express-validator"
import { provider } from "../oidc/provider"
import type { ClientUpsert } from "@shared/api-request/admin/ClientUpsert"
import type { User } from "@shared/db/User"
import { randomUUID } from "crypto"
import { allowNull, checkAdmin, checkLoggedIn, defaultNull, emailValidation, nameValidation, stringValidation, usernameValidation, uuidValidation } from "../util/validators"
import { getClient, getClients, removeClient, upsertClient } from "../db/client"
import type { UserGroup, Group, InvitationGroup } from "@shared/db/Group"
import type { GroupUpsert } from "@shared/api-request/admin/GroupUpsert"
import { ADMIN_GROUP, TTLs } from "@shared/constants"
import type { UserUpdate } from "@shared/api-request/admin/UserUpdate"
import { getUserById, getUsers } from "../db/user"
import { createAudit, createExpiration, mergeKeys } from "../db/util"
import type { UserDetails, UserWithoutPassword } from "@shared/api-response/UserDetails"
import { getInvitation, getInvitations } from "../db/invitations"
import type { Invitation } from "@shared/db/Invitation"
import type { InvitationUpsert } from "@shared/api-request/admin/InvitationUpsert"
import { nanoid } from "nanoid"
import { sendInvitation } from "../util/email"

const clientMetadataValidator: TypedSchema<ClientUpsert> = {
  client_id: {
    ...stringValidation,
    isLength: {
      options: {
        min: 1
      }
    },
  },
  redirect_uris: {
    isArray: true
  },
  "redirect_uris.*": {
    isURL: {
      options: {
        protocols: ['http', 'https'],
        require_tld: false,
        require_protocol: true,
      }
    },
    trim: true,
  },
  client_secret: {
    ...stringValidation,
    isLength: {
      options: {
        min: 1
      }
    },
  },
  token_endpoint_auth_method: {
    optional: true,
    ...stringValidation,
  }
}

export const adminRouter = Router()

adminRouter.use(checkLoggedIn, checkAdmin)

adminRouter.get("/clients", async (req, res) => {
  const clients = await getClients()
  res.send(clients)
})

adminRouter.get("/client/:client_id",
  ...validate<{ client_id: string }>({
    client_id: stringValidation,
  }), async (req: Request, res: Response) => {
    const { client_id } = matchedData<{ client_id: string }>(req)
    const client = await getClient(client_id)
    if (client) {
      res.send(client)
    } else {
      res.sendStatus(404)
    }
  }
)

/**
 * Because client_id is primary and user-defined, 
 * POST must always create a new client and PATCH must update an existing client
 */

adminRouter.post("/client",
  ...validate<ClientUpsert>(clientMetadataValidator),
  async (req: Request, res: Response) => {
    const clientMetadata = matchedData<ClientUpsert>(req)
    try {
      // check that existing client does not exist with client_id
      const existingClient = await getClient(clientMetadata.client_id)
      if (existingClient) {
        res.sendStatus(409)
      }

      await upsertClient(clientMetadata, provider.app.createContext(req, res))
      res.send()
    } catch (e) {
      res.sendStatus(400)
    }
  }
)

adminRouter.patch("/client",
  ...validate<ClientUpsert>(clientMetadataValidator),
  async (req: Request, res: Response) => {
    const clientMetadata = matchedData<ClientUpsert>(req)
    try {
      // check that existing client exists with client_id
      const existingClient = await getClient(clientMetadata.client_id)
      if (!existingClient) {
        res.sendStatus(404)
      }

      await upsertClient(clientMetadata, provider.app.createContext(req, res))
      res.send()
    } catch (e) {
      res.sendStatus(400)
    }
  }
)

adminRouter.delete("/client/:client_id",
  ...validate<{ client_id: string }>({
    client_id: stringValidation,
  }), async (req: Request, res: Response) => {
    const { client_id } = matchedData<{ client_id: string }>(req)
    const client = await getClient(client_id)
    if (!client) {
      res.sendStatus(404)
      return
    }
    await removeClient(client_id)
    res.send()
  }
)

adminRouter.get("/users", async (req, res) => {
  const users: UserWithoutPassword[] = await getUsers()
  res.send(users)
})

adminRouter.get("/user/:id",
  ...validate<{ id: string }>({
    id: uuidValidation
  }),
  async (req: Request, res: Response) => {
    const { id } = matchedData<{ id: string }>(req)
    const user = await getUserById(id)
    if (!user) {
      res.sendStatus(404)
      return
    }

    const groups = await db.select("name")
      .table<Group>('group')
      .innerJoin<UserGroup>('user_group', "user_group.groupId", "group.id").where({ "userId": id })
    const { passwordHash, ...userWithoutPassword } = user
    const userResponse: UserDetails = { ...userWithoutPassword, groups: groups.map(g => g.name) }

    res.send(userResponse)
  }
)

adminRouter.patch("/user",
  ...validate<UserUpdate>({
    id: uuidValidation,
    username: usernameValidation,
    name: nameValidation,
    email: {
      ...defaultNull,
      ...allowNull,
      optional: true,
      ...emailValidation
    },
    emailVerified: {
      isBoolean: true
    },
    approved: {
      isBoolean: true
    },
    groups: {
      isArray: true
    },
    "groups.*": stringValidation
  }),
  async (req: Request, res: Response) => {
    await db.transaction(async (trx) => {
      const userUpdate = matchedData<UserUpdate>(req)

      let { groups: _, ...user } = userUpdate;
      const ucount = await trx.table<User>("user").update(user).where({ id: userUpdate.id })
      const groups: Group[] = await trx.select().table<Group>("group").whereIn("name", userUpdate.groups)
      const userGroups: UserGroup[] = groups.map((g) => {
        return {
          groupId: g.id,
          userId: userUpdate.id,
          ...createAudit(req.user.id)
        }
      })

      if (userGroups?.[0]) {
        await trx.table<UserGroup>("user_group").insert(userGroups)
          .onConflict(['groupId', 'userId']).merge(mergeKeys(userGroups[0]))
      }

      await trx.table<UserGroup>("user_group").delete()
        .where({ userId: userUpdate.id }).and
        .whereNotIn("groupId", userGroups.map(g => g.groupId))

      if (!ucount) {
        res.sendStatus(404)
        return
      }

      res.send()
    })
  }
)

adminRouter.delete("/user/:id",
  ...validate<{ id: string }>({
    id: uuidValidation
  }),
  async (req: Request, res: Response) => {
    const { id } = matchedData(req)

    if (req.user.id === id) {
      res.sendStatus(400)
      return
    }

    const count = await db.table<User>("user").delete().where({ id })

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  }
)

adminRouter.get("/groups", async (req, res) => {
  const groups = await db.select().table<Group>("group")
  res.send(groups)
})

adminRouter.get("/group/:id",
  ...validate<{ id: string }>({
    id: uuidValidation
  }),
  async (req: Request, res: Response) => {
    const { id } = matchedData<{ id: string }>(req)
    const group = await db.select().table<Group>("group").where({ id }).first()
    if (group) {
      res.send(group)
    } else {
      res.sendStatus(404)
    }
  }
)

adminRouter.post("/group",
  ...validate<GroupUpsert>({
    id: {
      optional: {
        options: {
          values: "null"
        }
      },
      ...uuidValidation,
    },
    name: stringValidation,
  }),
  async (req: Request, res: Response) => {
    const { id, name } = matchedData<GroupUpsert>(req)

    // Do not update the ADMIN_GROUP
    if (name.toLowerCase() === ADMIN_GROUP.toLowerCase()) {
      res.sendStatus(400)
      return
    }

    // Check for name conflict
    const conflictingGroup = await db.select().table<Group>("group").whereRaw('lower("name") = lower(?)', [name]).first()
    if (conflictingGroup && conflictingGroup.id !== id) {
      res.sendStatus(409)
      return
    }

    const group: Group = {
      id: id ?? randomUUID(),
      name,
      ...createAudit(req.user.id)
    }

    await db.table<Group>("group").insert(group).onConflict(['id']).merge(mergeKeys(group));
    res.send(group)
  }
)

adminRouter.delete("/group/:id",
  ...validate<{ id: string }>({
    id: uuidValidation
  }),
  async (req: Request, res: Response) => {
    const { id } = matchedData<{ id: string }>(req)

    const group = await db.select().table<Group>("group").where({ id }).first()
    if (group?.name.toLowerCase() === ADMIN_GROUP.toLowerCase()) {
      res.sendStatus(400)
      return
    }

    await db.table<Group>("group").delete().where({ id })

    res.send()
  }
)

adminRouter.get("/invitations", async (req, res) => {
  const invitations: Invitation[] = await getInvitations()
  res.send(invitations)
})

adminRouter.get("/invitation/:id",
  ...validate<{ id: string }>({
    id: uuidValidation
  }),
  async (req: Request, res: Response) => {
    const { id } = matchedData<{ id: string }>(req)
    const invitation = await getInvitation(id)
    if (!invitation) {
      res.sendStatus(404)
      return
    }
    res.send(invitation)
  }
)

adminRouter.post("/invitation",
  ...validate<InvitationUpsert>({
    id: {
      optional: {
        options: {
          values: "null"
        }
      },
      ...uuidValidation
    },
    username: {
      ...defaultNull,
      ...allowNull,
      optional: true,
      ...usernameValidation
    },
    name: nameValidation,
    email: {
      ...defaultNull,
      ...allowNull,
      optional: true,
      ...emailValidation
    },
    groups: {
      isArray: true
    },
    "groups.*": stringValidation
  }),
  async (req: Request, res: Response) => {
    await db.transaction(async (trx) => {
      const invitationUpsert = matchedData<InvitationUpsert>(req)
      const { groups: groupNames, ...invitationData } = invitationUpsert;

      const id = invitationData.id ?? randomUUID()

      if (invitationData.id) {
        // update
        await trx.table<Invitation>("invitation").update({
          ...invitationData,
          ...createAudit(req.user.id)
        }).where({ id: invitationData.id })

      } else {
        // insert
        await trx.table<Invitation>("invitation").insert({
          ...invitationData,
          id,
          challenge: nanoid(),
          ...createAudit(req.user.id),
          expiresAt: createExpiration(TTLs.INVITATION)
        })
      }

      const groups: Group[] = await trx.select().table<Group>("group").whereIn("name", groupNames)
      const invitationGroups: InvitationGroup[] = groups.map((g) => {
        return {
          groupId: g.id,
          invitationId: id,
          ...createAudit(req.user.id)
        }
      })

      if (invitationGroups?.[0]) {
        await trx.table<InvitationGroup>("invitation_group").insert(invitationGroups)
          .onConflict(['groupId', 'invitationId']).merge(mergeKeys(invitationGroups[0]))
      }

      await trx.table<InvitationGroup>("invitation_group").delete()
        .where({ invitationId: id }).and
        .whereNotIn("groupId", invitationGroups.map(g => g.groupId))

      res.send(await getInvitation(id, trx))
    })
  }
)

adminRouter.delete("/invitation/:id",
  ...validate<{ id: string }>({
    id: uuidValidation
  }),
  async (req: Request, res: Response) => {
    const { id } = matchedData(req)

    const count = await db.table<Invitation>("invitation").delete().where({ id })

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  }
)

adminRouter.post("/send_invitation/:id", 
  ...validate<{ id: string }>({
    id: uuidValidation
  }),
  async (req: Request, res: Response) => {
    const { id } = matchedData<{ id: string }>(req)
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
  }
)