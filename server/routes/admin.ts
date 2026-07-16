import { Router, type Response } from 'express'
import { db, rollback } from '../db/db'
import { isProviderClaimsDesynced, isOIDCProviderError, provider, removeClient, resetProvider, upsertClient } from '../oidc/provider'
import { clientUpsertValidator, type ClientUpsert } from '@shared/api-request/admin/ClientUpsert'
import type { User } from '@shared/db/User'
import { randomBytes, randomUUID } from 'crypto'
import { getClient, getClients } from '../db/client'
import type { UserGroup, Group, InvitationGroup, ProxyAuthGroup } from '@shared/db/Group'
import { groupUpsertValidator } from '@shared/api-request/admin/GroupUpsert'
import { ADMIN_GROUP, PROTECTED_CLAIMS_SET, PROTECTED_SCOPES_SET, TTLs } from '@shared/constants'
import { userUpdateValidator } from '@shared/api-request/admin/UserUpdate'
import { endSessions, getUserById, getUsers } from '../db/user'
import { createExpiration, mergeKeys } from '../db/util'
import type { UserWithAdminIndicator } from '@shared/api-response/UserDetails'
import { getInvitation, getInvitations } from '../db/invitations'
import type { Invitation } from '@shared/db/Invitation'
import { invitationUpsertValidator } from '@shared/api-request/admin/InvitationUpsert'
import { sendApproved, sendInvitation, sendPasswordReset, sendTestNotification, SMTP_VERIFIED } from '../util/email'
import type { GroupUsers } from '@shared/api-response/admin/GroupUsers'
import type { ProxyAuth } from '@shared/db/ProxyAuth'
import { urlFromWildcardHref } from '@shared/url'
import type { ProxyAuthResponse } from '@shared/api-response/admin/ProxyAuthResponse'
import { proxyAuthUpsertValidator } from '@shared/api-request/admin/ProxyAuthUpsert'
import { getProxyAuth, getProxyAuths } from '../db/proxyAuth'
import type { PasswordResetUser } from '@shared/api-response/admin/PasswordResetUser'
import type { PasswordReset } from '@shared/db/PasswordReset'
import { passwordResetCreateValidator } from '@shared/api-request/admin/PasswordResetCreate'
import type { EmailLog } from '@shared/db/EmailLog'
import appConfig from '../util/config'
import type { EmailsResponse } from '@shared/api-response/admin/EmailsResponse'
import type { OIDCPayload } from '@shared/db/OIDCPayload'
import type { ClientResponse } from '@shared/api-response/ClientResponse'
import { logger } from '../util/logger'
import { createPasswordReset } from '../db/passwordReset'
import { zodValidate } from '../util/zodValidate'
import zod from 'zod'
import { checkAdmin, checkPrivileged } from '../util/authMiddleware'
import type { AdminConfig } from '@shared/api-response/admin/AdminConfig'
import type { IncomingMessage } from 'http'
import { TABLES } from '@shared/db'
import type { CustomClaim, CustomScope, UserCustomClaim } from '@shared/db/CustomClaim'
import { getAllScopes, getCustomClaimsRecords } from '../db/claims'
import type { CustomClaimsResponse } from '@shared/api-response/admin/CustomClaimResponse'
import type { ClientMetadata } from 'oidc-provider'

export const adminRouter = Router()

adminRouter.use(checkPrivileged, checkAdmin)

adminRouter.get('/config', async (_req, res) => {
  res.send({
    defaultUserExpireDuration: appConfig.DEFAULT_USER_EXPIRES_IN,
    defaultGroups: (await db().table<Group>(TABLES.GROUP).select('name').where({ autoAssign: true })).map(g => g.name),
  } satisfies AdminConfig)
})

adminRouter.get('/custom_scopes_claims', async (_req, res) => {
  const claims = await getCustomClaimsRecords()
  res.send(claims satisfies CustomClaimsResponse[])
})

adminRouter.get('/scopes', async (_req, res) => {
  const claims = await getAllScopes()
  res.send(claims satisfies string[])
})

adminRouter.get('/clients', async (_req, res) => {
  const clients = await getClients()
  res.send(clients satisfies ClientResponse[])
})

adminRouter.get('/client/:client_id',
  zodValidate({
    params: { client_id: zod.string() },
  }), async (req, res) => {
    const { client_id } = req.params
    const client = await getClient(client_id)
    if (client) {
      res.send(client satisfies ClientResponse)
    } else {
      res.sendStatus(404)
    }
  })

/**
 * Because client_id is primary and user-defined,
 * POST must always create a new client and PATCH must update an existing client
 */

async function upsertClientController(isCreate: boolean,
  req: IncomingMessage,
  res: Response,
  clientUpsert: ClientUpsert,
  reqUser: Pick<User, 'id'>) {
  if (clientUpsert.client_id === 'proxyauth_internal_client' || clientUpsert.client_id === 'auth_internal_client') {
    res.status(400).send({ message: 'client_id is reserved.' })
    return
  }

  if (clientUpsert.client_secret == null && clientUpsert.token_endpoint_auth_method !== 'none') {
    res.status(400).send({ message: `client_secret is required when token_endpoint_auth_method is not 'None (Public)'.` })
    return
  }

  try {
    // check that existing client does not exist with client_id
    const existingClient = await getClient(clientUpsert.client_id)
    if (isCreate && existingClient) {
      res.sendStatus(409)
      return
    } else if (!isCreate && !existingClient) {
      res.sendStatus(404)
      return
    }

    const { scopes, groups, post_logout_redirect_uri, ...rest } = clientUpsert
    const clientMetadata: ClientMetadata & typeof rest = rest

    clientMetadata.post_logout_redirect_uris = post_logout_redirect_uri ? [post_logout_redirect_uri] : []
    clientMetadata.scope = scopes.join(' ')

    // determine proper Application Type
    let hasHttpProtocol = false
    let hasCustomProtocol = false
    for (const uri of clientMetadata.redirect_uris) {
      const protocol = urlFromWildcardHref(uri)?.protocol
      hasHttpProtocol ||= protocol === 'http:'
      hasCustomProtocol ||= (protocol !== 'http:' && protocol !== 'https:')
    }
    if (hasCustomProtocol && hasHttpProtocol) {
      res.sendStatus(400)
      return
    }
    clientMetadata.application_type = hasCustomProtocol ? 'native' : 'web'

    await upsertClient(clientMetadata, groups, reqUser, provider().createContext(req, res))
    res.send()
  } catch (e) {
    if (isOIDCProviderError(e)) {
      await rollback() // still rollback any db changes
      res.status(400).send({ message: e.error_description })
    } else {
      throw e
    }
  }
}

adminRouter.post('/client',
  zodValidate(
    { body: clientUpsertValidator }),
  async (req, res) => {
    if (!req.user) {
      res.sendStatus(500)
      return
    }

    await upsertClientController(true, req, res, req.body, req.user)
  })

adminRouter.patch('/client',
  zodValidate(
    { body: clientUpsertValidator }),
  async (req, res) => {
    if (!req.user) {
      res.sendStatus(500)
      return
    }

    await upsertClientController(false, req, res, req.body, req.user)
  })

adminRouter.delete('/client/:client_id',
  zodValidate({
    params: { client_id: zod.string() },
  }), async (req, res) => {
    const { client_id } = req.params
    const client = await getClient(client_id)
    if (!client) {
      res.sendStatus(404)
      return
    }
    await removeClient(client_id)
    res.send()
  })

adminRouter.get('/proxyauths', async (_req, res) => {
  const proxyauths = await getProxyAuths()
  res.send(proxyauths)
})

adminRouter.get('/proxyauth/:id',
  zodValidate({
    params: {
      id: zod.uuidv4(),
    },
  }), async (req, res) => {
    const { id } = req.params
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
        .where({ proxyAuthId: proxyauth.id }).orderBy(db().ref('name').withSchema(TABLES.GROUP), 'asc')).map(v => v.name),
    }

    res.send(response)
  })

adminRouter.post('/proxyauth',
  zodValidate({ body: proxyAuthUpsertValidator }), async (req, res) => {
    const user = req.user
    if (!user) {
      res.sendStatus(500)
      return
    }

    const { id, domain, mfaRequired, maxSessionLength, groups } = req.body

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
  })

adminRouter.delete('/proxyauth/:id',
  zodValidate({
    params: {
      id: zod.uuidv4(),
    },
  }), async (req, res) => {
    const { id } = req.params

    await db().table<ProxyAuth>(TABLES.PROXY_AUTH).delete().where({ id })

    res.send()
  })

adminRouter.get('/users{/:searchTerm}',
  zodValidate({
    params: {
      searchTerm: zod.string().trim().optional(),
    },
  }), async (req, res) => {
    const { searchTerm } = req.params
    const users: UserWithAdminIndicator[] = await getUsers(searchTerm)
    res.send(users)
  })

adminRouter.get('/user/:id',
  zodValidate({
    params: {
      id: zod.uuidv4(),
    },
  }), async (req, res) => {
    const { id } = req.params
    const user = await getUserById(id)
    if (!user) {
      res.sendStatus(404)
      return
    }

    res.send(user)
  })

adminRouter.patch('/user',
  zodValidate({ body: userUpdateValidator }), async (req, res) => {
    const currentUser = req.user
    if (!currentUser) {
      res.sendStatus(500)
      return
    }

    const userUpdate = req.body
    const { groups: userGroupNames, customClaims: userCustomClaims, ...user } = userUpdate

    // Validate user custom claims
    const userCustomClaimKeys: Record<string, Set<string>> = {}
    for (const customClaim of userCustomClaims) {
      // Make sure scope and claim are not protected
      if (PROTECTED_SCOPES_SET.has(customClaim.scope) || PROTECTED_CLAIMS_SET.has(customClaim.claim)) {
        res.status(400).send({ message: 'A custom scope or claim is reserved.' })
        return
      }
      // Check and make sure no duplicate scope+claim records in user custom claims
      if (userCustomClaimKeys[customClaim.scope]?.has(customClaim.claim)) {
        res.status(400).send({ message: 'Duplicate custom claim scope + claim combinations are not allowed.' })
        return
      }
      let scopeClaims = userCustomClaimKeys[customClaim.scope]
      if (!scopeClaims) {
        const newScopeClaims = new Set<string>()
        userCustomClaimKeys[customClaim.scope] = newScopeClaims
        scopeClaims = newScopeClaims
      }
      scopeClaims.add(customClaim.claim)
    }

    const existingUser = await db().table<User>(TABLES.USER).where({ id: userUpdate.id }).first()
    if (!existingUser) {
      res.sendStatus(404)
      return
    }
    const groups: Group[] = await db().select().table<Group>(TABLES.GROUP).whereIn('name', userGroupNames.map(g => g.name))
    if (groups.length !== userGroupNames.length) {
      res.sendStatus(400)
      return
    }

    const ucount = await db().table<User>(TABLES.USER).update({ ...user, updatedAt: new Date() }).where({ id: userUpdate.id })

    if (!ucount) {
      res.sendStatus(404)
      return
    }

    // Update groups
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

    // Sync Custom Claims.
    // We are going to do some confusing stuff here so that custom scopes+claims do not have to be managed
    // manually in the webUI but just ***magically*** appear when they are added to a user
    if (!userCustomClaims.length) {
      // remove all user custom claims
      await db().table<UserCustomClaim>(TABLES.USER_CUSTOM_CLAIM).delete().where({ userId: userUpdate.id })
    } else {
      // Make sure all the custom claims the user wants exist
      // Start with the scopes
      let customScopes: CustomScope[] = userCustomClaims.map(c => ({
        id: randomUUID(),
        scope: c.scope,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
      if (customScopes[0]) {
        customScopes = await db().table<CustomScope>(TABLES.CUSTOM_SCOPE).insert(customScopes)
          .onConflict(['scope']).merge(mergeKeys(customScopes[0])).returning('*')
      }

      // Then make sure there are matching claims
      let customClaims: CustomClaim[] = userCustomClaims.map((c) => {
        const matchingScope = customScopes.find(cc => cc.scope === c.scope)
        if (!matchingScope) {
          throw new Error('Matching scope for user custom claim could not be found!')
        }
        return {
          id: randomUUID(),
          scopeId: matchingScope.id,
          claim: c.claim,
          includedInLdap: false, // by default do not include in LDAP, but include in merge keys so that it does not overwrite
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      })
      if (customClaims[0]) {
        customClaims = await db().table<CustomClaim>(TABLES.CUSTOM_CLAIM).insert(customClaims)
          .onConflict(['scopeId', 'claim']).merge(mergeKeys(customClaims[0], ['includedInLdap'])).returning('*')
      }

      // Delete any user custom claims not present in new custom claims payload
      await db().table<UserCustomClaim>(TABLES.USER_CUSTOM_CLAIM).delete()
        .where({ userId: userUpdate.id }).and
        .whereNotIn('claimId', customClaims.map(c => c.id))

      // Upsert provided user custom claims into user custom claims table
      const upsertUserCustomClaims: UserCustomClaim[] = userCustomClaims.map((c) => {
        const matchingScope = customScopes.find(cc => cc.scope === c.scope)
        if (!matchingScope) {
          throw new Error('Matching scope for user custom claim could not be found!')
        }
        const matchingClaim = customClaims.find(cc => cc.scopeId === matchingScope.id && cc.claim === c.claim)
        if (!matchingClaim) {
          throw new Error('Matching claim for user custom claim could not be found!')
        }
        return {
          id: randomUUID(),
          userId: userUpdate.id,
          claimId: matchingClaim.id,
          value: c.value,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      })
      if (upsertUserCustomClaims[0]) {
        await db().table<UserCustomClaim>(TABLES.USER_CUSTOM_CLAIM).insert(upsertUserCustomClaims)
          .onConflict(['claimId', 'userId']).merge(mergeKeys(upsertUserCustomClaims[0]))
      }
    }

    // Check if all custom claims matches current provider claims, update if not
    if (await isProviderClaimsDesynced()) {
      await resetProvider()
    }

    if (SMTP_VERIFIED && appConfig.SIGNUP_REQUIRES_APPROVAL && !existingUser.approved && userUpdate.approved && userUpdate.email) {
      const userApprovedEmail = await db().table<EmailLog>(TABLES.EMAIL_LOG)
        .where({ type: 'approved', toUser: userUpdate.id }).first()
      if (!userApprovedEmail) {
        // Only sent approved email to users that have never received one before
        try {
          await sendApproved(userUpdate, userUpdate.email)
        } catch (e) {
          logger({
            level: 'error',
            message: 'Error occurred while sending approved email.',
            errors: e instanceof Error ? [e] : [{ message: String(e) }],
          })
        }
      }
    }

    res.send()
  })

adminRouter.delete('/user/:id',
  zodValidate({
    params: {
      id: zod.uuidv4(),
    },
  }), async (req, res) => {
    const currentUser = req.user
    if (!currentUser) {
      res.sendStatus(500)
      return
    }

    const { id } = req.params

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
  })

adminRouter.post('/user/signout/:id',
  zodValidate({
    params: {
      id: zod.uuidv4(),
    },
  }), async (req, res) => {
    const currentUser = req.user
    if (!currentUser) {
      res.sendStatus(500)
      return
    }

    const { id } = req.params

    if (currentUser.id === id) {
      res.sendStatus(400)
      return
    }

    await endSessions(id)

    res.send()
  })

adminRouter.patch('/users/approve',
  zodValidate({
    body: {
      users: zod.array(zod.uuidv4()),
    },
  }), async (req, res) => {
    const { users } = req.body

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
          logger({
            level: 'error',
            message: 'Error occurred while sending approved email.',
            errors: e instanceof Error ? [e] : [{ message: String(e) }],
          })
        }
      }
    }

    res.send()
  })

adminRouter.post('/users/delete',
  zodValidate({
    body: {
      users: zod.array(zod.uuidv4()),
    },
  }), async (req, res) => {
    const currentUser = req.user
    if (!currentUser) {
      res.sendStatus(500)
      return
    }

    const { users } = req.body

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

    const count = await db().table<User>(TABLES.USER).delete().whereIn('id', users)

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  })

adminRouter.get('/groups', async (_req, res) => {
  const groups = await db().select().table<Group>(TABLES.GROUP).orderBy(db().ref('createdAt').withSchema(TABLES.GROUP), 'asc')
  res.send(groups)
})

adminRouter.get('/group/:id',
  zodValidate({
    params: {
      id: zod.uuidv4(),
    },
  }), async (req, res) => {
    const { id } = req.params
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
        .where({ groupId: group.id }).orderBy(db().ref('name').withSchema(TABLES.USER), 'asc'),
    }

    res.send(groupWithUsers)
  })

adminRouter.post('/group',
  zodValidate({ body: groupUpsertValidator }), async (req, res) => {
    const currentUser = req.user
    if (!currentUser) {
      res.sendStatus(500)
      return
    }

    const { id, name, mfaRequired, autoAssign, users } = req.body

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

    // Admin group has special checks
    if (name.toLowerCase() === ADMIN_GROUP.toLowerCase()) {
      // If this IS the ADMIN_GROUP, there should always be at least one user
      if (!users.length) {
        res.sendStatus(400)
        return
      }

      // Admin group cannot be auto-assigned
      if (autoAssign) {
        res.sendStatus(400)
        return
      }
    }

    const group: Group = {
      id: groupId,
      name,
      mfaRequired,
      autoAssign,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await db().table<Group>(TABLES.GROUP).insert(group).onConflict(['id']).merge(mergeKeys(group))

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
  })

adminRouter.delete('/group/:id',
  zodValidate({
    params: {
      id: zod.uuidv4(),
    },
  }), async (req, res) => {
    const { id } = req.params

    const group = await db().select().table<Group>(TABLES.GROUP).where({ id }).first()
    // Do not delete the admin group
    if (group?.name.toLowerCase() === ADMIN_GROUP.toLowerCase()) {
      res.sendStatus(400)
      return
    }

    await db().table<Group>(TABLES.GROUP).delete().where({ id })

    res.send()
  })

adminRouter.get('/invitations', async (_req, res) => {
  const invitations: Invitation[] = await getInvitations()
  res.send(invitations)
})

adminRouter.get('/invitation/:id',
  zodValidate({
    params: { id: zod.uuidv4() },
  }), async (req, res) => {
    const { id } = req.params
    const invitation = await getInvitation(id)
    if (!invitation) {
      res.sendStatus(404)
      return
    }
    res.send(invitation)
  })

adminRouter.post('/invitation',
  zodValidate({ body: invitationUpsertValidator }), async (req, res) => {
    const currentUser = req.user
    if (!currentUser) {
      res.sendStatus(500)
      return
    }

    const invitationUpsert = req.body
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
        challenge: randomBytes(24).toString('base64url'),
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
  })

adminRouter.delete('/invitation/:id',
  zodValidate({
    params: {
      id: zod.uuidv4(),
    },
  }), async (req, res) => {
    const { id } = req.params

    const count = await db().table<Invitation>(TABLES.INVITATION).delete().where({ id })

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  })

adminRouter.post('/send_invitation/:id',
  zodValidate({
    params: {
      id: zod.uuidv4(),
    },
  }), async (req, res) => {
    const { id } = req.params
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
  })

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
    .where(db().ref('expiresAt').withSchema(TABLES.PASSWORD_RESET), '>=', new Date())
    .orderBy(db().ref('expiresAt').withSchema(TABLES.PASSWORD_RESET), 'desc')
  res.send(passwordResets)
})

adminRouter.post('/passwordreset',
  zodValidate({ body: passwordResetCreateValidator }), async (req, res) => {
    const { userId } = req.body
    const user = await getUserById(userId)

    if (!user) {
      res.sendStatus(404)
      return
    }

    const passwordReset = await createPasswordReset(user.id)

    const result: PasswordResetUser = { ...passwordReset, username: user.username, email: user.email }
    res.send(result)
  })

adminRouter.delete('/passwordreset/:id',
  zodValidate({
    params: {
      id: zod.uuidv4(),
    },
  }), async (req, res) => {
    const { id } = req.params

    const count = await db().table<PasswordReset>(TABLES.PASSWORD_RESET).delete().where({ id })

    if (!count) {
      res.sendStatus(404)
      return
    }

    res.send()
  })

adminRouter.post('/send_passwordreset/:id',
  zodValidate({
    params: {
      id: zod.uuidv4(),
    },
  }), async (req, res) => {
    const { id } = req.params
    const reset = await db().select().table<PasswordReset>(TABLES.PASSWORD_RESET).where({ id })
      .andWhere('expiresAt', '>=', new Date()).first()

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
  })

adminRouter.get('/emails',
  zodValidate({
    query: {
      page: zod.coerce.number<string>().int().min(0),
      pageSize: zod.coerce.number<string>().int().min(1),
      sortActive: zod.enum(['createdAt', 'to', 'type']).optional(),
      sortDirection: zod.enum(['asc', 'desc', '']).optional(),
    },
  }), async (req, res) => {
    const { page, pageSize, sortActive, sortDirection } = req.query

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
  })

adminRouter.post('/send_test_email',
  zodValidate({
    body: {
      email: zod.email({ pattern: zod.regexes.rfc5322Email }),
    },
  }), async (req, res) => {
    const { email } = req.body

    await sendTestNotification(email)

    res.send()
  })
