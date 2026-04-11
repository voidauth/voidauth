import { Router } from 'express'
import { updateProfileValidator } from '@shared/api-request/UpdateProfile'

import { db } from '../db/db'
import { updateEmailValidator } from '@shared/api-request/UpdateEmail'
import appConfig from '../util/config'
import { createEmailVerification } from './interaction'
import { updatePasswordValidator } from '@shared/api-request/UpdatePassword'
import type { User } from '@shared/db/User'
import { checkPasswordHash } from '../db/user'
import { deleteUserPasskey, deleteUserPasskeys, getUserPasskeys, getUserPasskeysResponse, updateUserPasskey } from '../db/passkey'
import type { OIDCPayload } from '@shared/db/OIDCPayload'
import { TABLES } from '@shared/constants'
import type { TOTP } from '@shared/db/TOTP'
import { argon2 } from '../util/argon2id'
import { zodValidate } from '../util/zodValidate'
import { passwordStrength } from '../util/zxcvbn'
import { checkPrivileged, checkPrivilegedForEmail, checkUserExists } from '../util/authMiddleware'
import type { PasskeyResponse } from '@shared/api-response/PasskeyResponse'
import zod from 'zod'
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'

export const userRouter = Router()

userRouter.use(checkUserExists)

userRouter.get('/me',
  (req, res) => {
    const user = req.user

    if (!user) {
      res.sendStatus(500)
      return
    }

    const response: CurrentUserDetails = {
      id: user.id,
      isAdmin: user.isAdmin,
      emailVerified: user.emailVerified,
      hasTotp: user.hasTotp,
      hasPasskeys: user.hasPasskeys,

      amr: user.amr,
      canLogin: user.canLogin,
      isPrivilegedForTotpCreate: user.isPrivilegedForTotpCreate,
      isPrivilegedForEmail: user.isPrivilegedForEmail,
      isPrivileged: user.isPrivileged,

      hasEmail: user.hasEmail,
    }

    res.send(response)
    return
  },
)

userRouter.post('/send_verify_email',
  async (req, res) => {
    if (!appConfig.EMAIL_VERIFICATION) {
      res.sendStatus(400)
      return
    }
    const user = req.user

    if (!user) {
      res.sendStatus(500)
      return
    }

    if (user.emailVerified) {
      res.status(400).send({ message: 'Email is already verified.' })
      return
    }

    const sent = await createEmailVerification(user)
    if (!sent) {
      res.status(400).send({ message: 'Verification Email could not be sent.' })
      return
    }

    res.send()
    return
  })

// Update user email address
userRouter.patch('/email',
  checkPrivilegedForEmail,
  zodValidate({ body: updateEmailValidator }),
  async (req, res) => {
    const user = req.user
    if (!user) {
      res.sendStatus(500)
      return
    }

    const { email } = req.body

    let sentVerification = false

    if (appConfig.EMAIL_VERIFICATION && email) {
      sentVerification = await createEmailVerification(user, email)
      if (!sentVerification) {
        res.status(400).send({ message: 'Verification Email could not be sent.' })
        return
      }
    }

    if (!appConfig.EMAIL_VERIFICATION || !user.hasEmail) {
      await db().table<User>(TABLES.USER).update({ email }).where({ id: user.id })
    }

    res.send({ sentVerification })
  })

userRouter.use(checkPrivileged)

userRouter.get('/me/private',
  (req, res) => {
    const user = req.user

    if (!user) {
      res.sendStatus(500)
      return
    }

    res.send(user)
    return
  },
)

// Update user profile information
userRouter.patch('/profile',
  zodValidate({ body: updateProfileValidator }), async (req, res) => {
    const user = req.user
    if (!user) {
      res.sendStatus(500)
      return
    }

    const profile = req.body

    await db().table<User>(TABLES.USER).update(profile).where({ id: user.id })

    res.send()
  })

// Change user password
userRouter.patch('/password',
  zodValidate({ body: updatePasswordValidator }), async (req, res) => {
    const user = req.user
    if (!user) {
      res.sendStatus(500)
      return
    }

    const { oldPassword, newPassword } = req.body

    if (passwordStrength(newPassword).score < appConfig.PASSWORD_STRENGTH) {
      res.status(422).send({ message: 'Password is not strong enough.' })
    }

    if (user.hasPassword && (!oldPassword || !await checkPasswordHash(user.id, oldPassword))) {
      res.sendStatus(401)
      return
    }

    await db().table<User>(TABLES.USER).update({ passwordHash: argon2.hash(newPassword) }).where({ id: user.id })
    res.send()
  })

userRouter.get('/passkeys', async (req, res) => {
  const user = req.user
  if (!user) {
    res.sendStatus(500)
    return
  }

  const passkeys = await getUserPasskeysResponse(user.id)

  res.send(passkeys satisfies PasskeyResponse[])
})

userRouter.patch('/passkey/:id',
  zodValidate({
    params: {
      id: zod.string(),
    },
    body: {
      displayName: zod.string().trim().transform(v => v || null).nullable(),
    },
  }),
  async (req, res) => {
    const user = req.user
    if (!user) {
      res.sendStatus(500)
      return
    }

    const { displayName } = req.body

    await updateUserPasskey(req.params.id, user.id, { displayName })

    res.send()
  })

userRouter.delete('/passkey/:id',
  zodValidate({
    params: {
      id: zod.string(),
    },
  }),
  async (req, res) => {
    const user = req.user
    if (!user) {
      res.sendStatus(500)
      return
    }

    // make sure that either user has password or will have passkey(s) remaining after delete
    if (!user.hasPassword && ((await getUserPasskeys(user.id)).length) < 2) {
      res.sendStatus(400)
      return
    }

    const deleted = await deleteUserPasskey(req.params.id, user.id)

    if (!deleted) {
      res.sendStatus(404)
      return
    }

    if (deleted > 1) {
      throw new Error('Deleted multiple passkeys in a single request.')
    }

    res.send()
  })

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
