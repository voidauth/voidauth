import { Router } from 'express'
import { db } from '../db/db'
import { isOIDCProviderError, provider } from '../oidc/provider'
import { GRANT_TYPES, RESPONSE_TYPES, type ClientUpsert } from '@shared/api-request/admin/ClientUpsert'
import type { User } from '@shared/db/User'
import { randomUUID } from 'crypto'
import { checkAdmin, checkPrivileged, coerceEmailOrNull } from '../util/validators'
import { getClient, getClients, removeClient, upsertClient } from '../db/client'
import type { UserGroup, Group, InvitationGroup, ProxyAuthGroup } from '@shared/db/Group'
import type { GroupUpsert } from '@shared/api-request/admin/GroupUpsert'
import { ADMIN_GROUP, TABLES, TTLs, USERNAME_REGEX } from '@shared/constants'
import type { UserUpdate } from '@shared/api-request/admin/UserUpdate'
import { endSessions, getUserById, getUsers } from '../db/user'
import { createExpiration, mergeKeys } from '../db/util'
import type { UserWithAdminIndicator } from '@shared/api-response/UserDetails'
import { getInvitation, getInvitations } from '../db/invitations'
import type { Invitation } from '@shared/db/Invitation'
import type { InvitationUpsert } from '@shared/api-request/admin/InvitationUpsert'
import { sendApproved, sendInvitation, sendPasswordReset, sendTestNotification, SMTP_VERIFIED } from '../util/email'
import { generate } from 'generate-password'
import type { GroupUsers } from '@shared/api-response/admin/GroupUsers'
import type { ProxyAuth } from '@shared/db/ProxyAuth'
import { formatWildcardDomain, isValidWildcardDomain, urlFromWildcardHref, isValidWildcardRedirect } from '@shared/utils'
import type { ProxyAuthResponse } from '@shared/api-response/admin/ProxyAuthResponse'
import type { ProxyAuthUpsert } from '@shared/api-request/admin/ProxyAuthUpsert'
import { getProxyAuth, getProxyAuths } from '../db/proxyAuth'
import type { PasswordResetUser } from '@shared/api-response/admin/PasswordResetUser'
import type { PasswordReset } from '@shared/db/PasswordReset'
import type { PasswordResetCreate } from '@shared/api-request/admin/PasswordResetCreate'
import type { EmailLog } from '@shared/db/EmailLog'
import appConfig from '../util/config'
import type { EmailsResponse } from '@shared/api-response/admin/EmailsResponse'
import type { OIDCPayload } from '@shared/db/OIDCPayload'
import type { ClientResponse } from '@shared/api-response/ClientResponse'
import { logger } from '../util/logger'
import { createPasswordReset } from '../db/passwordReset'
import { zodValidate, type SchemaShape } from '../util/validate'
import zod from 'zod'
import { nameValidation } from '../util/validators'

const clientMetadataValidator = {
  client_id: zod.string().min(1).trim(),
  client_name: zod.string().trim().optional(),
  redirect_uris: zod.array(zod.string().trim().refine((input) => {
    return typeof input === 'string' && isValidWildcardRedirect(input)
  })),
  post_logout_redirect_uri: zod.string().trim().refine((input) => {
    return typeof input === 'string' && isValidWildcardRedirect(input)
  }).optional(),
  client_secret: zod.string().trim().min(1).optional(),
  token_endpoint_auth_method: zod.enum([
    'client_secret_basic',
    'client_secret_post',
    'client_secret_jwt',
    'private_key_jwt',
    'tls_client_auth',
    'self_signed_tls_client_auth',
    'none']).optional(),
  response_types: zod.array(zod.enum(RESPONSE_TYPES)).optional(),
  grant_types: zod.array(zod.enum(GRANT_TYPES)).optional(),
  skip_consent: zod.boolean(),
  require_mfa: zod.boolean(),
  logo_uri: zod.url().trim().optional(),
  client_uri: zod.url().trim().optional(),
  groups: zod.array(zod.string()),
} satisfies SchemaShape<ClientUpsert>

export const adminRouter = Router()

adminRouter.use(checkPrivileged, checkAdmin)

adminRouter.get('/clients', async (_req, res) => {
  const clients = await getClients()
  res.send(clients)
})

adminRouter.get('/client/:client_id',
  zodValidate<{ client_id: string }>({
    client_id: zod.string(),
  }, async (req, res) => {
    const { client_id } = req.validatedData
    const client = await getClient(client_id)
    if (client) {
      res.send(client)
    } else {
      res.sendStatus(404)
    }
  }))

/**
 * Because client_id is primary and user-defined,
 * POST must always create a new client and PATCH must update an existing client
 */

adminRouter.post('/client',
  zodValidate<ClientUpsert>(
    clientMetadataValidator,
    async (req, res) => {
      if (!req.user) {
        res.sendStatus(500)
        return
      }

      const clientUpsert = req.validatedData
      const clientMetadata: ClientResponse = {
        ...clientUpsert,
        post_logout_redirect_uris: clientUpsert.post_logout_redirect_uri ? [clientUpsert.post_logout_redirect_uri] : [],
      }

      if (clientUpsert.client_secret == null && clientUpsert.token_endpoint_auth_method !== 'none') {
        res.status(400).send({ message: `client_secret is required when token_endpoint_auth_method is not 'None (Public)'.` })
        return
      }

      try {
      // check that existing client does not exist with client_id
        const existingClient = await getClient(clientMetadata.client_id)
        if (existingClient) {
          res.sendStatus(409)
          return
        }

        // determine proper Application Type
        let hasHttpProtocol = false
        let hasCustomProtocol = false
        for (const uri of clientUpsert.redirect_uris) {
          const protocol = urlFromWildcardHref(uri)?.protocol
          hasHttpProtocol ||= protocol === 'http:'
          hasCustomProtocol ||= (protocol !== 'http:' && protocol !== 'https:')
        }
        if (hasCustomProtocol && hasHttpProtocol) {
          res.sendStatus(400)
          return
        }
        clientMetadata.application_type = hasCustomProtocol ? 'native' : 'web'

        await upsertClient(provider, clientMetadata, req.user, provider.createContext(req, res))
        res.send()
      } catch (e) {
        res.status(400).send({ message: isOIDCProviderError(e) ? e.error_description : e })
      }
    }))

adminRouter.patch('/client',
  zodValidate<ClientUpsert>(
    clientMetadataValidator,
    async (req, res) => {
      if (!req.user) {
        res.sendStatus(500)
        return
      }

      const clientUpsert = req.validatedData
      const clientMetadata: ClientResponse = {
        ...clientUpsert,
        post_logout_redirect_uris: clientUpsert.post_logout_redirect_uri ? [clientUpsert.post_logout_redirect_uri] : [],
      }

      if (clientUpsert.client_secret == null && clientUpsert.token_endpoint_auth_method !== 'none') {
        res.status(400).send({ message: `client_secret is required when token_endpoint_auth_method is not 'None (Public)'.` })
        return
      }

      try {
      // check that existing client exists with client_id
        const existingClient = await getClient(clientMetadata.client_id)
        if (!existingClient) {
          res.sendStatus(404)
          return
        }

        // determine proper Application Type
        let hasHttpProtocol = false
        let hasCustomProtocol = false
        for (const uri of clientUpsert.redirect_uris) {
          const protocol = urlFromWildcardHref(uri)?.protocol
          hasHttpProtocol ||= protocol === 'http:'
          hasCustomProtocol ||= (protocol !== 'http:' && protocol !== 'https:')
        }
        if (hasCustomProtocol && hasHttpProtocol) {
          res.sendStatus(400)
          return
        }
        clientMetadata.application_type = hasCustomProtocol ? 'native' : 'web'

        await upsertClient(provider, clientMetadata, req.user, provider.createContext(req, res))
        res.send()
      } catch (e) {
        if (isOIDCProviderError(e)) {
          res.status(400).send({ message: e.error_description })
        } else {
          throw e
        }
      }
    }))

adminRouter.delete('/client/:client_id',
  zodValidate<{ client_id: string }>({
    client_id: zod.string(),
  }, async (req, res) => {
    const { client_id } = req.validatedData
    const client = await getClient(client_id)
    if (!client) {
      res.sendStatus(404)
      return
    }
    await removeClient(client_id)
    res.send()
  }))

adminRouter.get('/proxyauths', async (_req, res) => {
  const proxyauths = await getProxyAuths()
  res.send(proxyauths)
})

adminRouter.get('/proxyauth/:id',
  zodValidate<{ id: string }>({
    id: zod.uuidv4(),
  }, async (req, res) => {
    const { id } = req.validatedData
    const proxyauth = await getProxyAuth(id)

    if (!proxyauth) {
      res.sendStatus(404)
      return
    }

    const response: ProxyAuthResponse = {
      ...proxyauth,
      groups: (await db().select('name')
        .table<Group>(TABLES.GROUP)
        .innerJoin<ProxyAuthGroup>(TABLES.PROXY_AUTH_GROUP, 'proxy_auth_group.groupId', 'group.id')
        .where({ proxyAuthId: proxyauth.id }).orderBy('name', 'asc')).map(v => v.name),
    }

    res.send(response)
  }))

adminRouter.post('/proxyAuth',
  zodValidate<ProxyAuthUpsert>({
    id: zod.uuidv4().optional(),
    domain: zod.string().refine(val => isValidWildcardDomain(val)).transform(val => formatWildcardDomain(val)),
    mfaRequired: zod.union([zod.boolean(), zod.number()]),
    maxSessionLength: zod.int().min(5).max(525600).nullable(),
    groups: zod.array(zod.string()),
  }, async (req, res) => {
    const user = req.user
    if (!user) {
      res.sendStatus(500)
      return
    }

    const { id, domain, mfaRequired, maxSessionLength, groups } = req.validatedData

    // Check for domain conflict
    const conflicting = await db().select()
      .table<ProxyAuth>(TABLES.PROXY_AUTH)
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
      mfaRequired,
      maxSessionLength: maxSessionLength ?? null,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await db().table<ProxyAuth>(TABLES.PROXY_AUTH).insert(proxyAuth).onConflict(['id']).merge(mergeKeys(proxyAuth))

    const proxyAuthGroups: ProxyAuthGroup[] = (await db().select().table<Group>(TABLES.GROUP).whereIn('name', groups)).map((g) => {
      return {
        proxyAuthId: proxyAuthId,
        groupId: g.id,
        createdBy: user.id,
        updatedBy: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })

    if (proxyAuthGroups[0]) {
      await db().table<ProxyAuthGroup>(TABLES.PROXY_AUTH_GROUP).insert(proxyAuthGroups)
        .onConflict(['groupId', 'proxyAuthId']).merge(mergeKeys(proxyAuthGroups[0]))
    }

    await db().table<ProxyAuthGroup>(TABLES.PROXY_AUTH_GROUP).delete()
      .where({ proxyAuthId: proxyAuthId }).and
      .whereNotIn('groupId', proxyAuthGroups.map(g => g.groupId))

    res.send(await getProxyAuth(proxyAuthId))
  }))

adminRouter.delete('/proxyauth/:id',
  zodValidate<{ id: string }>({
    id: zod.uuidv4(),
  }, async (req, res) => {
    const { id } = req.validatedData

    await db().table<ProxyAuth>(TABLES.PROXY_AUTH).delete().where({ id })

    res.send()
  }))

adminRouter.get('/users{/:searchTerm}',
  zodValidate<{ searchTerm?: string }>({
    searchTerm: zod.string().optional(),
  }, async (req, res) => {
    const { searchTerm } = req.validatedData
    const users: UserWithAdminIndicator[] = await getUsers(searchTerm)
    res.send(users)
  }))

adminRouter.get('/user/:id',
  zodValidate<{ id: string }>({
    id: zod.uuidv4(),
  }, async (req, res) => {
    const { id } = req.validatedData
    const user = await getUserById(id)
    if (!user) {
      res.sendStatus(404)
      return
    }

    res.send(user)
  }))

adminRouter.patch('/user',
  zodValidate<UserUpdate>({
    id: zod.uuidv4(),
    username: zod.string().regex(USERNAME_REGEX),
    name: nameValidation,
    email: coerceEmailOrNull.optional(),
    emailVerified: zod.union([zod.boolean(), zod.number()]),
    approved: zod.union([zod.boolean(), zod.number()]),
    mfaRequired: zod.union([zod.boolean(), zod.number()]),
    groups: zod.array(zod.object({
      name: zod.string(),
      id: zod.uuidv4(),
    })),
  }, async (req, res) => {
    const currentUser = req.user
    if (!currentUser) {
      res.sendStatus(500)
      return
    }

    const userUpdate = req.validatedData

    const existingUser = await db().table<User>(TABLES.USER).where({ id: userUpdate.id }).first()
    if (!existingUser) {
      res.sendStatus(404)
      return
    }

    const { groups: _, ...user } = userUpdate
    const ucount = await db().table<User>(TABLES.USER).update({ ...user, updatedAt: new Date() }).where({ id: userUpdate.id })
    const groups: Group[] = await db().select().table<Group>(TABLES.GROUP).whereIn('name', userUpdate.groups.map(g => g.name))
    const userGroups: UserGroup[] = groups.map((g) => {
      return {
        groupId: g.id,
        userId: userUpdate.id,
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })

    if (userGroups[0]) {
      await db().table<UserGroup>(TABLES.USER_GROUP).insert(userGroups)
        .onConflict(['groupId', 'userId']).merge(mergeKeys(userGroups[0]))
    }

    await db().table<UserGroup>(TABLES.USER_GROUP).delete()
      .where({ userId: userUpdate.id }).and
      .whereNotIn('groupId', userGroups.map(g => g.groupId))

    if (!ucount) {
      res.sendStatus(404)
      return
    }

    if (SMTP_VERIFIED && appConfig.SIGNUP_REQUIRES_APPROVAL && !existingUser.approved && userUpdate.approved && userUpdate.email) {
      const userApprovedEmail = await db().table<EmailLog>(TABLES.EMAIL_LOG)
        .where({ type: 'approved', toUser: userUpdate.id }).first()
      if (!userApprovedEmail) {
        // Only sent approved email to users that have never received one before
        try {
          await sendApproved(userUpdate, userUpdate.email)
        } catch (e) {
          logger.error(e)
        }
      }
    }

    res.send()
  }))

adminRouter.delete('/user/:id',
  zodValidate<{ id: string }>({
    id: zod.uuidv4(),
  }, async (req, res) => {
    const currentUser = req.user
    if (!currentUser) {
      res.sendStatus(500)
      return
    }

    const { id } = req.validatedData

    if (currentUser.id === id) {
      res.sendStatus(400)
      return
    }

    const count = await db().table<User>(TABLES.USER).delete().where({ id })
    await db().table<OIDCPayload>(TABLES.OIDC_PAYLOADS).delete().where({ accountId: id })

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  }))

adminRouter.post('/user/signout/:id',
  zodValidate<{ id: string }>({
    id: zod.uuidv4(),
  }, async (req, res) => {
    const currentUser = req.user
    if (!currentUser) {
      res.sendStatus(500)
      return
    }

    const { id } = req.validatedData

    if (currentUser.id === id) {
      res.sendStatus(400)
      return
    }

    await endSessions(id)

    res.send()
  }))

adminRouter.patch('/users/approve',
  zodValidate<{ users: string[] }>({
    users: zod.array(zod.uuidv4()),
  }, async (req, res) => {
    const { users } = req.validatedData

    if (!users.length) {
      // nothing to do
      res.send()
      return
    }

    await db().table<User>(TABLES.USER).update({ approved: true }).whereIn('id', users)

    const usersWithEmail = await db().select('id', 'email', 'name', 'username').table<User>(TABLES.USER).whereIn('id', users)
    const userApprovedSent = await db().select().table<EmailLog>(TABLES.EMAIL_LOG).where({ type: 'approved' })
      .and.whereIn('toUser', users)

    for (const user of usersWithEmail) {
      // Only sent approved email to users that have never received one before
      if (SMTP_VERIFIED && appConfig.SIGNUP_REQUIRES_APPROVAL && user.email && !userApprovedSent.some(e => e.toUser === user.id)) {
        try {
          await sendApproved(user, user.email)
        } catch (e) {
          logger.error(e)
        }
      }
    }

    res.send()
  }))

adminRouter.post('/users/delete',
  zodValidate<{ users: string[] }>({
    users: zod.array(zod.uuidv4()),
  }, async (req, res) => {
    const currentUser = req.user
    if (!currentUser) {
      res.sendStatus(500)
      return
    }

    const { users } = req.validatedData

    if (!users.length) {
      // nothing to do
      res.send()
      return
    }

    // Don't delete yourself
    if (users.some(id => id === currentUser.id)) {
      res.sendStatus(400)
      return
    }

    await db().table<User>(TABLES.USER).update({ approved: true }).whereIn('id', users)

    const count = await db().table<User>(TABLES.USER).delete().whereIn('id', users)

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  }))

adminRouter.get('/groups', async (_req, res) => {
  const groups = await db().select().table<Group>(TABLES.GROUP).orderBy('createdAt', 'asc')
  res.send(groups)
})

adminRouter.get('/group/:id',
  zodValidate<{ id: string }>({
    id: zod.uuidv4(),
  }, async (req, res) => {
    const { id } = req.validatedData
    const group = await db().select().table<Group>(TABLES.GROUP).where({ id }).first()

    if (!group) {
      res.sendStatus(404)
      return
    }

    const groupWithUsers: GroupUsers = {
      ...group,
      users: await db().select('id', 'username')
        .table<User>(TABLES.USER)
        .innerJoin<UserGroup>(TABLES.USER_GROUP, 'user_group.userId', 'user.id')
        .where({ groupId: group.id }).orderBy('name', 'asc'),
    }

    res.send(groupWithUsers)
  }))

adminRouter.post('/group',
  zodValidate<GroupUpsert>({
    id: zod.uuidv4().optional(),
    name: zod.string().regex(new RegExp('^[A-Za-z0-9_-]+$')),
    mfaRequired: zod.union([zod.boolean(), zod.number()]),
    users: zod.array(zod.object({
      id: zod.uuidv4(),
      username: zod.string(),
    })),
  }, async (req, res) => {
    const currentUser = req.user
    if (!currentUser) {
      res.sendStatus(500)
      return
    }

    const { id, name, mfaRequired, users } = req.validatedData

    // Check for name conflict
    const conflictingGroup = await db().select()
      .table<Group>(TABLES.GROUP)
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
        mfaRequired,
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      await db().table<Group>(TABLES.GROUP).insert(group).onConflict(['id']).merge(mergeKeys(group))
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
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })

    if (userGroups[0]) {
      await db().table<UserGroup>(TABLES.USER_GROUP).insert(userGroups)
        .onConflict(['groupId', 'userId']).merge(mergeKeys(userGroups[0]))
    }

    await db().table<UserGroup>(TABLES.USER_GROUP).delete()
      .where({ groupId: groupId }).and
      .whereNotIn('userId', userGroups.map(g => g.userId))

    res.send({ id: groupId })
  }))

adminRouter.delete('/group/:id',
  zodValidate<{ id: string }>({
    id: zod.uuidv4(),
  }, async (req, res) => {
    const { id } = req.validatedData

    const group = await db().select().table<Group>(TABLES.GROUP).where({ id }).first()
    // Do not delete the admin group
    if (group?.name.toLowerCase() === ADMIN_GROUP.toLowerCase()) {
      res.sendStatus(400)
      return
    }

    await db().table<Group>(TABLES.GROUP).delete().where({ id })

    res.send()
  }))

adminRouter.get('/invitations', async (_req, res) => {
  const invitations: Invitation[] = await getInvitations()
  res.send(invitations)
})

adminRouter.get('/invitation/:id',
  zodValidate<{ id: string }>({
    id: zod.uuidv4(),
  }, async (req, res) => {
    const { id } = req.validatedData
    const invitation = await getInvitation(id)
    if (!invitation) {
      res.sendStatus(404)
      return
    }
    res.send(invitation)
  }))

adminRouter.post('/invitation',
  zodValidate<InvitationUpsert>({
    id: zod.uuidv4().optional(),
    username: zod.string().regex(USERNAME_REGEX).nullish(),
    name: nameValidation,
    email: coerceEmailOrNull.optional(),
    emailVerified: zod.union([zod.boolean(), zod.number()]),
    groups: zod.array(zod.string()),
  }, async (req, res) => {
    const currentUser = req.user
    if (!currentUser) {
      res.sendStatus(500)
      return
    }

    const invitationUpsert = req.validatedData
    const { groups: groupNames, ...invitationData } = invitationUpsert

    const id = invitationData.id ?? randomUUID()

    if (invitationData.id) {
      // update
      await db().table<Invitation>(TABLES.INVITATION).update({
        ...invitationData,
        updatedBy: currentUser.id,
        updatedAt: new Date(),
      }).where({ id: invitationData.id })
    } else {
      // insert
      await db().table<Invitation>(TABLES.INVITATION).insert({
        ...invitationData,
        id,
        challenge: generate({
          length: 32,
          numbers: true,
        }),
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: createExpiration(TTLs.INVITATION),
      })
    }

    const groups: Group[] = await db().select().table<Group>(TABLES.GROUP).whereIn('name', groupNames)
    const invitationGroups: InvitationGroup[] = groups.map((g) => {
      return {
        groupId: g.id,
        invitationId: id,
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })

    if (invitationGroups[0]) {
      await db().table<InvitationGroup>(TABLES.INVITATION_GROUP).insert(invitationGroups)
        .onConflict(['groupId', 'invitationId']).merge(mergeKeys(invitationGroups[0]))
    }

    await db().table<InvitationGroup>(TABLES.INVITATION_GROUP).delete()
      .where({ invitationId: id }).and
      .whereNotIn('groupId', invitationGroups.map(g => g.groupId))

    const invitation = await getInvitation(id)
    res.send(invitation)
  }))

adminRouter.delete('/invitation/:id',
  zodValidate<{ id: string }>({
    id: zod.uuidv4(),
  }, async (req, res) => {
    const { id } = req.validatedData

    const count = await db().table<Invitation>(TABLES.INVITATION).delete().where({ id })

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  }))

adminRouter.post('/send_invitation/:id',
  zodValidate<{ id: string }>({
    id: zod.uuidv4(),
  }, async (req, res) => {
    const { id } = req.validatedData
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
  }))

adminRouter.get('/passwordresets', async (_req, res) => {
  const passwordResets: PasswordResetUser[] = await db().select(
    db().ref('username').withSchema(TABLES.USER),
    db().ref('email').withSchema(TABLES.USER),
    db().ref('id').withSchema(TABLES.PASSWORD_RESET),
    db().ref('userId').withSchema(TABLES.PASSWORD_RESET),
    db().ref('challenge').withSchema(TABLES.PASSWORD_RESET),
    db().ref('expiresAt').withSchema(TABLES.PASSWORD_RESET),
    db().ref('createdAt').withSchema(TABLES.PASSWORD_RESET),
  ).table<PasswordReset>(TABLES.PASSWORD_RESET)
    .innerJoin<User>(TABLES.USER, 'user.id', 'password_reset.userId')
    .where('expiresAt', '>=', new Date())
    .orderBy('expiresAt', 'desc')
  res.send(passwordResets)
})

adminRouter.post('/passwordreset',
  zodValidate<PasswordResetCreate>({
    userId: zod.uuidv4(),
  }, async (req, res) => {
    const { userId } = req.validatedData
    const user = await getUserById(userId)

    if (!user) {
      res.sendStatus(404)
      return
    }

    const passwordReset = await createPasswordReset(user.id)

    const result: PasswordResetUser = { ...passwordReset, username: user.username, email: user.email }
    res.send(result)
  }))

adminRouter.delete('/passwordreset/:id',
  zodValidate<{ id: string }>({
    id: zod.uuidv4(),
  }, async (req, res) => {
    const { id } = req.validatedData

    const count = await db().table<PasswordReset>(TABLES.PASSWORD_RESET).delete().where({ id })

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  }))

adminRouter.post('/send_passwordreset/:id',
  zodValidate<{ id: string }>({
    id: zod.uuidv4(),
  }, async (req, res) => {
    const { id } = req.validatedData
    const reset = await db().select().table<PasswordReset>(TABLES.PASSWORD_RESET).where({ id }).first()

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
  }))

type EmailsRequest = {
  page: number
  pageSize: number
  sortActive?: 'createdAt' | 'to' | 'type'
  sortDirection?: 'asc' | 'desc' | ''
}
adminRouter.get('/emails',
  zodValidate<EmailsRequest>({
    page: zod.coerce.number().int().min(0),
    pageSize: zod.coerce.number().int().min(1),
    sortActive: zod.enum(['createdAt', 'to', 'type']).optional(),
    sortDirection: zod.enum(['asc', 'desc', '']).optional(),
  }, async (req, res) => {
    const { page, pageSize, sortActive, sortDirection } = req.validatedData

    const emailsModel = db().table<EmailLog>(TABLES.EMAIL_LOG)

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
        body: e.body,
        subject: e.subject,
      }
    })

    const result: EmailsResponse = { count, emails }

    res.send(result)
  }))

adminRouter.post('/send_test_email',
  zodValidate<{ email: string }>({
    email: zod.email(),
  }, async (req, res) => {
    const { email } = req.validatedData

    await sendTestNotification(email)

    res.send()
  }))
