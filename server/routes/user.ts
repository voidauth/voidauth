import { Router } from 'express'
import type { UpdateProfile } from '@shared/api-request/UpdateProfile'

import { db } from '../db/db'
import type { UpdateEmail } from '@shared/api-request/UpdateEmail'
import appConfig from '../util/config'
import { createEmailVerification } from './interaction'
import type { UpdatePassword } from '@shared/api-request/UpdatePassword'
import { checkPrivileged, coerceEmailOrNull } from '../util/validators'
import type { User } from '@shared/db/User'
import { checkPasswordHash } from '../db/user'
import { deleteUserPasskeys } from '../db/passkey'
import type { OIDCPayload } from '@shared/db/OIDCPayload'
import { TABLES } from '@shared/constants'
import type { TOTP } from '@shared/db/TOTP'
import { argon2 } from '../util/argon2id'
import { zodValidate } from '../util/validate'
import { nameValidation, newPasswordValidation } from '../util/validators'
import zod from 'zod'

export const userRouter = Router()

userRouter.get('/me',
  (req, res) => {
    const user = req.user

    if (!user) {
      res.sendStatus(401)
    }

    res.send(user)
    return
  },
)

userRouter.use(checkPrivileged)

// Update user profile information
userRouter.patch('/profile',
  zodValidate<UpdateProfile>({
    name: nameValidation,
  }, async (req, res) => {
    const user = req.user
    if (!user) {
      res.sendStatus(500)
      return
    }

    const profile = req.validatedData

    await db().table<User>(TABLES.USER).update(profile).where({ id: user.id })

    res.send()
  }))

// Update user email address
userRouter.patch('/email',
  zodValidate<UpdateEmail>({
    email: coerceEmailOrNull,
  }, async (req, res) => {
    const user = req.user
    if (!user) {
      res.sendStatus(500)
      return
    }

    const { email } = req.validatedData

    if (appConfig.EMAIL_VERIFICATION && email) {
      await createEmailVerification(user, email)
    } else {
      await db().table<User>(TABLES.USER).update({ email }).where({ id: user.id })
    }

    res.send()
  }))

// Change user password
userRouter.patch('/password',
  zodValidate<UpdatePassword>({
    oldPassword: zod.string().nullish(),
    newPassword: newPasswordValidation,
  }, async (req, res) => {
    const user = req.user
    if (!user) {
      res.sendStatus(500)
      return
    }

    const { oldPassword, newPassword } = req.validatedData

    if (user.hasPassword && (!oldPassword || !await checkPasswordHash(user.id, oldPassword))) {
      res.sendStatus(403)
      return
    }

    await db().table<User>(TABLES.USER).update({ passwordHash: argon2.hash(newPassword) }).where({ id: user.id })
    res.send()
  }))

// Delete all user passkeys
userRouter.delete('/passkeys', async (req, res) => {
  const user = req.user
  if (!user) {
    res.sendStatus(500)
    return
  }

  if (!user.hasPassword) {
    res.sendStatus(400)
    return
  }

  if (!user.hasPasskeys) {
    res.sendStatus(404)
    return
  }

  await deleteUserPasskeys(user.id)
  res.send()
})

// Delete user password
userRouter.delete('/password', async (req, res) => {
  const user = req.user
  if (!user) {
    res.sendStatus(500)
    return
  }

  if (!user.hasPasskeys) {
    res.sendStatus(400)
    return
  }

  if (!user.hasPassword) {
    res.sendStatus(404)
    return
  }

  await db().table<User>(TABLES.USER).update({ passwordHash: null }).where({ id: user.id })
  res.send()
})

// Delete user authenticators
userRouter.delete('/totp', async (req, res) => {
  const user = req.user
  if (!user) {
    res.sendStatus(500)
    return
  }

  if (!user.hasTotp) {
    res.sendStatus(404)
    return
  }

  await db().table<TOTP>(TABLES.TOTP).delete().where({ userId: user.id })
  await db().table<User>(TABLES.USER).update({ mfaRequired: false }).where({ id: user.id })

  res.send()
})

// Delete a user
userRouter.delete('/user', async (req, res) => {
  const user = req.user
  if (!user) {
    res.sendStatus(500)
    return
  }

  await db().table<User>(TABLES.USER).delete().where({ id: user.id })
  await db().table<OIDCPayload>(TABLES.OIDC_PAYLOADS).delete().where({ accountId: user.id })
  res.send()
})
