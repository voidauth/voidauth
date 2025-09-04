import { Router } from 'express'
import { validate, validatorData, type TypedSchema } from '../util/validate'
import { db } from '../db/db'
import { isOIDCProviderError, provider } from '../oidc/provider'
import { GRANT_TYPES, RESPONSE_TYPES, type ClientUpsert } from '@shared/api-request/admin/ClientUpsert'
import type { User } from '@shared/db/User'
import { randomUUID } from 'crypto'
import {
  unlessNull,
  checkAdmin, checkLoggedIn, emailValidation,
  nameValidation, stringValidation, usernameValidation, uuidValidation,
} from '../util/validators'
import { getClient, getClients, removeClient, upsertClient } from '../db/client'
import type { UserGroup, Group, InvitationGroup, ProxyAuthGroup } from '@shared/db/Group'
import type { GroupUpsert } from '@shared/api-request/admin/GroupUpsert'
import { ADMIN_GROUP, TTLs } from '@shared/constants'
import type { UserUpdate } from '@shared/api-request/admin/UserUpdate'
import { endSessions, getUserById, getUsers } from '../db/user'
import { createExpiration, mergeKeys } from '../db/util'
import type { UserWithAdminIndicator } from '@shared/api-response/UserDetails'
import { getInvitation, getInvitations } from '../db/invitations'
import type { Invitation } from '@shared/db/Invitation'
import type { InvitationUpsert } from '@shared/api-request/admin/InvitationUpsert'
import { sendApproved, sendInvitation, sendPasswordReset, SMTP_VERIFIED } from '../util/email'
import { generate } from 'generate-password'
import type { GroupUsers } from '@shared/api-response/admin/GroupUsers'
import type { ProxyAuth } from '@shared/db/ProxyAuth'
import { formatWildcardDomain, isValidWildcardDomain } from '@shared/utils'
import type { ProxyAuthResponse } from '@shared/api-response/admin/ProxyAuthResponse'
import type { ProxyAuthUpsert } from '@shared/api-request/admin/ProxyAuthUpsert'
import { getProxyAuth, getProxyAuths } from '../db/proxyAuth'
import type { PasswordResetUser } from '@shared/api-response/admin/PasswordResetUser'
import type { PasswordReset } from '@shared/db/PasswordReset'
import type { PasswordResetCreate } from '@shared/api-request/admin/PasswordResetCreate'
import type { EmailLog } from '@shared/db/EmailLog'
import appConfig from '../util/config'
import type { EmailsResponse } from '@shared/api-response/admin/EmailsResponse'
import DOMPurify from 'isomorphic-dompurify'
import type { OIDCPayload } from '@shared/db/OIDCPayload'

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
  'redirect_uris.*': {
    isValidURL: {
      custom: (input) => {
        return typeof input === 'string' && URL.parse(input)
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
  application_type: {
    optional: true,
    ...stringValidation,
  },
  response_types: {
    optional: true,
    isArray: true,
  },
  'response_types.*': {
    optional: true,
    ...stringValidation,
    isIn: {
      options: [RESPONSE_TYPES],
    },
  },
  grant_types: {
    optional: true,
    isArray: true,
  },
  'grant_types.*': {
    optional: true,
    ...stringValidation,
    isIn: {
      options: [GRANT_TYPES],
    },
  },
  skip_consent: {
    optional: true,
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
        protocols: ['http', 'https'],
        require_tld: false,
        require_protocol: true,
      },
    },
    trim: true,
  },
}

export const adminRouter = Router()

adminRouter.use(checkLoggedIn, checkAdmin)

adminRouter.get('/clients', async (_req, res) => {
  const clients = await getClients()
  res.send(clients)
})

adminRouter.get('/client/:client_id',
  ...validate<{ client_id: string }>({
    client_id: stringValidation,
  }), async (req, res) => {
    const { client_id } = validatorData<{ client_id: string }>(req)
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

adminRouter.post('/client',
  ...validate<ClientUpsert>(clientMetadataValidator),
  async (req, res) => {
    const clientMetadata = validatorData<ClientUpsert>(req)
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
      res.status(400).send({ message: isOIDCProviderError(e) ? e.error_description : e })
    }
  },
)

adminRouter.patch('/client',
  ...validate<ClientUpsert>(clientMetadataValidator),
  async (req, res) => {
    const clientMetadata = validatorData<ClientUpsert>(req)
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
      res.status(400).send({ message: isOIDCProviderError(e) ? e.error_description : e })
    }
  },
)

adminRouter.delete('/client/:client_id',
  ...validate<{ client_id: string }>({
    client_id: stringValidation,
  }), async (req, res) => {
    const { client_id } = validatorData<{ client_id: string }>(req)
    const client = await getClient(client_id)
    if (!client) {
      res.sendStatus(404)
      return
    }
    await removeClient(client_id)
    res.send()
  },
)

adminRouter.get('/proxyauths', async (_req, res) => {
  const proxyauths = await getProxyAuths()
  res.send(proxyauths)
})

adminRouter.get('/proxyauth/:id',
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req, res) => {
    const { id } = validatorData<{ id: string }>(req)
    const proxyauth = await getProxyAuth(id)

    if (!proxyauth) {
      res.sendStatus(404)
      return
    }

    const response: ProxyAuthResponse = {
      ...proxyauth,
      groups: (await db().select('name')
        .table<Group>('group')
        .innerJoin<ProxyAuthGroup>('proxy_auth_group', 'proxy_auth_group.groupId', 'group.id')
        .where({ proxyAuthId: proxyauth.id }).orderBy('name', 'asc')).map(v => v.name),
    }

    res.send(response)
  },
)

adminRouter.post('/proxyAuth',
  ...validate<ProxyAuthUpsert>({
    id: {
      optional: {
        options: {
          values: 'null',
        },
      },
      ...uuidValidation,
    },
    domain: {
      ...stringValidation,
      valid: {
        custom: (d: unknown) => {
          if (typeof d !== 'string') {
            return false
          }
          return isValidWildcardDomain(d)
        },
      },
      format: {
        customSanitizer: (d: string) => {
          return formatWildcardDomain(d)
        },
      },
    },
    groups: {
      isArray: true,
    },
    'groups.*': stringValidation,
  }),
  async (req, res) => {
    const { id, domain, groups } = validatorData<ProxyAuthUpsert>(req)

    // Check for domain conflict
    const conflicting = await db().select()
      .table<ProxyAuth>('proxy_auth')
      .whereRaw('lower("domain") = lower(?)', [domain])
      .first()
    if (conflicting && conflicting.id !== id) {
      res.sendStatus(409)
      return
    }

    const proxyAuthId = id ?? randomUUID()

    const proxyAuth: ProxyAuth = {
      id: proxyAuthId,
      domain,
      createdBy: req.user.id,
      updatedBy: req.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await db().table<ProxyAuth>('proxy_auth').insert(proxyAuth).onConflict(['id']).merge(mergeKeys(proxyAuth))

    const proxyAuthGroups: ProxyAuthGroup[] = (await db().select().table<Group>('group').whereIn('name', groups)).map((g) => {
      return {
        proxyAuthId: proxyAuthId,
        groupId: g.id,
        createdBy: req.user.id,
        updatedBy: req.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })

    if (proxyAuthGroups[0]) {
      await db().table<ProxyAuthGroup>('proxy_auth_group').insert(proxyAuthGroups)
        .onConflict(['groupId', 'proxyAuthId']).merge(mergeKeys(proxyAuthGroups[0]))
    }

    await db().table<ProxyAuthGroup>('proxy_auth_group').delete()
      .where({ proxyAuthId: proxyAuthId }).and
      .whereNotIn('groupId', proxyAuthGroups.map(g => g.groupId))

    res.send(await getProxyAuth(proxyAuthId))
  },
)

adminRouter.delete('/proxyauth/:id',
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req, res) => {
    const { id } = validatorData<{ id: string }>(req)

    await db().table<ProxyAuth>('proxy_auth').delete().where({ id })

    res.send()
  },
)

adminRouter.get('/users{/:searchTerm}',
  ...validate<{ searchTerm?: string }>({
    searchTerm: {
      optional: true,
      ...stringValidation,
    },
  }),
  async (req, res) => {
    const { searchTerm } = validatorData<{ searchTerm?: string }>(req)
    const users: UserWithAdminIndicator[] = await getUsers(searchTerm)
    res.send(users)
  },
)

adminRouter.get('/user/:id',
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req, res) => {
    const { id } = validatorData<{ id: string }>(req)
    const user = await getUserById(id)
    if (!user) {
      res.sendStatus(404)
      return
    }

    res.send(user)
  },
)

adminRouter.patch('/user',
  ...validate<UserUpdate>({
    id: uuidValidation,
    username: usernameValidation,
    name: nameValidation,
    email: {
      default: {
        options: null,
      },
      optional: true,
      ...unlessNull,
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
    'groups.*': stringValidation,
  }),
  async (req, res) => {
    const userUpdate = validatorData<UserUpdate>(req)

    const existingUser = await db().table<User>('user').where({ id: userUpdate.id }).first()
    if (!existingUser) {
      res.sendStatus(404)
      return
    }

    const { groups: _, ...user } = userUpdate
    const ucount = await db().table<User>('user').update({ ...user, updatedAt: new Date() }).where({ id: userUpdate.id })
    const groups: Group[] = await db().select().table<Group>('group').whereIn('name', userUpdate.groups)
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
      await db().table<UserGroup>('user_group').insert(userGroups)
        .onConflict(['groupId', 'userId']).merge(mergeKeys(userGroups[0]))
    }

    await db().table<UserGroup>('user_group').delete()
      .where({ userId: userUpdate.id }).and
      .whereNotIn('groupId', userGroups.map(g => g.groupId))

    if (!ucount) {
      res.sendStatus(404)
      return
    }

    if (SMTP_VERIFIED && appConfig.SIGNUP_REQUIRES_APPROVAL && !existingUser.approved && userUpdate.approved && userUpdate.email) {
      const userApprovedEmail = await db().table<EmailLog>('email_log')
        .where({ type: 'approved', toUser: userUpdate.id }).first()
      if (!userApprovedEmail) {
        // Only sent approved email to users that have never received one before
        try {
          await sendApproved(userUpdate, userUpdate.email)
        } catch (e) {
          console.error(e)
        }
      }
    }

    res.send()
  },
)

adminRouter.delete('/user/:id',
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req, res) => {
    const { id } = validatorData<{ id: string }>(req)

    if (req.user.id === id) {
      res.sendStatus(400)
      return
    }

    const count = await db().table<User>('user').delete().where({ id })
    await db().table<OIDCPayload>('oidc_payloads').delete().where({ accountId: id })

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  },
)

adminRouter.post('/user/signout/:id',
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req, res) => {
    const { id } = validatorData<{ id: string }>(req)

    if (req.user.id === id) {
      res.sendStatus(400)
      return
    }

    await endSessions(id)

    res.send()
  },
)

adminRouter.patch('/users/approve',
  ...validate<{ users: string[] }>({
    users: {
      isArray: true,
    },
    'users.*': {
      ...uuidValidation,
    },
  }),
  async (req, res) => {
    const { users } = validatorData<{ users: string[] }>(req)

    if (!users.length) {
      // nothing to do
      res.send()
      return
    }

    await db().table<User>('user').update({ approved: true }).whereIn('id', users)

    const usersWithEmail = await db().select('id', 'email', 'name', 'username').table<User>('user').whereIn('id', users)
    const userApprovedSent = await db().select().table<EmailLog>('email_log').where({ type: 'approved' })
      .and.whereIn('toUser', users)

    for (const user of usersWithEmail) {
      // Only sent approved email to users that have never received one before
      if (SMTP_VERIFIED && appConfig.SIGNUP_REQUIRES_APPROVAL && user.email && !userApprovedSent.some(e => e.toUser === user.id)) {
        try {
          await sendApproved(user, user.email)
        } catch (e) {
          console.error(e)
        }
      }
    }

    res.send()
  },
)

adminRouter.post('/users/delete',
  ...validate<{ users: string[] }>({
    users: {
      isArray: true,
    },
    'users.*': {
      ...uuidValidation,
    },
  }),
  async (req, res) => {
    const { users } = validatorData<{ users: string[] }>(req)

    if (!users.length) {
      // nothing to do
      res.send()
      return
    }

    // Don't delete yourself
    if (users.some(id => id === req.user.id)) {
      res.sendStatus(400)
      return
    }

    await db().table<User>('user').update({ approved: true }).whereIn('id', users)

    const count = await db().table<User>('user').delete().whereIn('id', users)

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  },
)

adminRouter.get('/groups', async (_req, res) => {
  const groups = await db().select().table<Group>('group').orderBy('createdAt', 'asc')
  res.send(groups)
})

adminRouter.get('/group/:id',
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req, res) => {
    const { id } = validatorData<{ id: string }>(req)
    const group = await db().select().table<Group>('group').where({ id }).first()

    if (!group) {
      res.sendStatus(404)
      return
    }

    const groupWithUsers: GroupUsers = {
      ...group,
      users: await db().select('id', 'username')
        .table<User>('user')
        .innerJoin<UserGroup>('user_group', 'user_group.userId', 'user.id')
        .where({ groupId: group.id }).orderBy('name', 'asc'),
    }

    res.send(groupWithUsers)
  },
)

adminRouter.post('/group',
  ...validate<GroupUpsert>({
    id: {
      optional: {
        options: {
          values: 'null',
        },
      },
      ...uuidValidation,
    },
    name: stringValidation,
    users: {
      isArray: true,
    },
    'users.*.id': uuidValidation,
    'users.*.username': {
      optional: true, // we don't use this
    },
  }),
  async (req, res) => {
    const { id, name, users } = validatorData<GroupUpsert>(req)

    // Check for name conflict
    const conflictingGroup = await db().select()
      .table<Group>('group')
      .whereRaw('lower("name") = lower(?)', [name])
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

      await db().table<Group>('group').insert(group).onConflict(['id']).merge(mergeKeys(group))
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
      await db().table<UserGroup>('user_group').insert(userGroups)
        .onConflict(['groupId', 'userId']).merge(mergeKeys(userGroups[0]))
    }

    await db().table<UserGroup>('user_group').delete()
      .where({ groupId: groupId }).and
      .whereNotIn('userId', userGroups.map(g => g.userId))

    res.send({ id: groupId })
  },
)

adminRouter.delete('/group/:id',
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req, res) => {
    const { id } = validatorData<{ id: string }>(req)

    const group = await db().select().table<Group>('group').where({ id }).first()
    // Do not delete the admin group
    if (group?.name.toLowerCase() === ADMIN_GROUP.toLowerCase()) {
      res.sendStatus(400)
      return
    }

    await db().table<Group>('group').delete().where({ id })

    res.send()
  },
)

adminRouter.get('/invitations', async (_req, res) => {
  const invitations: Invitation[] = await getInvitations()
  res.send(invitations)
})

adminRouter.get('/invitation/:id',
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req, res) => {
    const { id } = validatorData<{ id: string }>(req)
    const invitation = await getInvitation(id)
    if (!invitation) {
      res.sendStatus(404)
      return
    }
    res.send(invitation)
  },
)

adminRouter.post('/invitation',
  ...validate<InvitationUpsert>({
    id: {
      optional: {
        options: {
          values: 'null',
        },
      },
      ...uuidValidation,
    },
    username: {
      default: {
        options: null,
      },
      optional: true,
      ...unlessNull,
      ...usernameValidation,
    },
    name: nameValidation,
    email: {
      default: {
        options: null,
      },
      optional: true,
      ...unlessNull,
      ...emailValidation,
    },
    emailVerified: {
      isBoolean: true,
    },
    groups: {
      isArray: true,
    },
    'groups.*': stringValidation,
  }),
  async (req, res) => {
    const invitationUpsert = validatorData<InvitationUpsert>(req)
    const { groups: groupNames, ...invitationData } = invitationUpsert

    const id = invitationData.id ?? randomUUID()

    if (invitationData.id) {
      // update
      await db().table<Invitation>('invitation').update({
        ...invitationData,
        updatedBy: req.user.id,
        updatedAt: new Date(),
      }).where({ id: invitationData.id })
    } else {
      // insert
      await db().table<Invitation>('invitation').insert({
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

    const groups: Group[] = await db().select().table<Group>('group').whereIn('name', groupNames)
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
      await db().table<InvitationGroup>('invitation_group').insert(invitationGroups)
        .onConflict(['groupId', 'invitationId']).merge(mergeKeys(invitationGroups[0]))
    }

    await db().table<InvitationGroup>('invitation_group').delete()
      .where({ invitationId: id }).and
      .whereNotIn('groupId', invitationGroups.map(g => g.groupId))

    const invitation = await getInvitation(id)
    res.send(invitation)
  },
)

adminRouter.delete('/invitation/:id',
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req, res) => {
    const { id } = validatorData<{ id: string }>(req)

    const count = await db().table<Invitation>('invitation').delete().where({ id })

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  },
)

adminRouter.post('/send_invitation/:id',
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req, res) => {
    const { id } = validatorData<{ id: string }>(req)
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

adminRouter.get('/passwordresets', async (_req, res) => {
  const passwordResets: PasswordResetUser[] = await db().select(
    db().ref('username').withSchema('user'),
    db().ref('email').withSchema('user'),
    db().ref('id').withSchema('password_reset'),
    db().ref('userId').withSchema('password_reset'),
    db().ref('challenge').withSchema('password_reset'),
    db().ref('expiresAt').withSchema('password_reset'),
    db().ref('createdAt').withSchema('password_reset'),
  ).table<PasswordReset>('password_reset')
    .innerJoin<User>('user', 'user.id', 'password_reset.userId')
    .where('expiresAt', '>=', new Date())
    .orderBy('expiresAt', 'desc')
  res.send(passwordResets)
})

adminRouter.post('/passwordreset',
  ...validate<PasswordResetCreate>({
    userId: uuidValidation,
  }),
  async (req, res) => {
    const { userId } = validatorData<PasswordResetCreate>(req)
    const user = await getUserById(userId)

    if (!user) {
      res.sendStatus(404)
      return
    }

    const passwordReset: PasswordReset = {
      id: randomUUID(),
      userId: user.id,
      challenge: generate({
        length: 32,
        numbers: true,
      }),
      createdAt: new Date(),
      expiresAt: createExpiration(TTLs.PASSWORD_RESET),
    }
    await db().table<PasswordReset>('password_reset').insert(passwordReset)

    const result: PasswordResetUser = { ...passwordReset, username: user.username, email: user.email }
    res.send(result)
  },
)

adminRouter.delete('/passwordreset/:id',
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req, res) => {
    const { id } = validatorData<{ id: string }>(req)

    const count = await db().table<PasswordReset>('password_reset').delete().where({ id })

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  },
)

adminRouter.post('/send_passwordreset/:id',
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req, res) => {
    const { id } = validatorData<{ id: string }>(req)
    const reset = await db().select().table<PasswordReset>('password_reset').where({ id }).first()

    if (!reset) {
      res.sendStatus(404)
      return
    }

    const user = await getUserById(reset.userId)

    if (!user?.email) {
      res.sendStatus(400)
      return
    }

    await sendPasswordReset(reset, user, user.email)
    res.send()
  },
)

type EmailsRequest = {
  page: number
  pageSize: number
  sortActive?: 'createdAt' | 'to' | 'type'
  sortDirection?: 'asc' | 'desc' | ''
}
adminRouter.get('/emails',
  ...validate<EmailsRequest>({
    page: {
      isInt: {
        options: {
          min: 0,
        },
      },
      toInt: true,
    },
    pageSize: {
      isInt: {
        options: {
          min: 1,
        },
      },
      toInt: true,
    },
    sortActive: {
      optional: true,
      ...stringValidation,
      isIn: {
        options: [['createdAt', 'to', 'type']],
      },
    },
    sortDirection: {
      optional: true,
      ...stringValidation,
      isIn: {
        options: [['asc', 'desc', '']],
      },
    },
  }),
  async (req, res) => {
    const { page, pageSize, sortActive, sortDirection } = validatorData<EmailsRequest>(req)

    const emailsModel = db().table<EmailLog>('email_log')

    const count = +((await emailsModel.clone().count({ count: '*' }).first())?.count ?? 0)

    switch (sortActive) {
      case 'to':
        emailsModel.orderBy(sortActive, sortDirection || 'desc')
        break
      case 'type':
        emailsModel.orderBy(sortActive, sortDirection || 'desc')
        break
      case 'createdAt':
      default:
        emailsModel.orderBy('createdAt', sortDirection || 'desc')
    }

    const emails = (await emailsModel.clone().select().offset(page * pageSize).limit(pageSize)).map((e) => {
      return {
        ...e,
        body: e.body ? DOMPurify.sanitize(e.body) : e.body,
        subject: DOMPurify.sanitize(e.subject),
      }
    })

    const result: EmailsResponse = { count, emails }

    res.send(result)
  })
