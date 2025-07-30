import { Router } from 'express'
import { validate, validatorData } from '../util/validate'
import type { UpdateProfile } from '@shared/api-request/UpdateProfile'

import { db } from '../db/db'
import * as argon2 from 'argon2'
import type { UpdateEmail } from '@shared/api-request/UpdateEmail'
import appConfig from '../util/config'
import { createEmailVerification } from './interaction'
import type { UpdatePassword } from '@shared/api-request/UpdatePassword'
import { checkLoggedIn, emailValidation, nameValidation, newPasswordValidation, stringValidation } from '../util/validators'
import type { User } from '@shared/db/User'
import { checkPasswordHash } from '../db/user'

export const userRouter = Router()

userRouter.use(checkLoggedIn)

userRouter.get('/me',
  (req, res) => {
    res.send(req.user)
  },
)

userRouter.patch('/profile',
  ...validate<UpdateProfile>({
    name: nameValidation,
  }),
  async (req, res) => {
    const user = req.user
    const profile = validatorData<UpdateProfile>(req)

    await db().table<User>('user').update(profile).where({ id: user.id })

    res.send()
  },
)

userRouter.patch('/email',
  ...validate<UpdateEmail>({
    email: emailValidation,
  }),
  async (req, res) => {
    const user = req.user

    const { email } = validatorData<UpdateEmail>(req)

    if (appConfig.EMAIL_VERIFICATION && email) {
      await createEmailVerification(user, email)
    } else {
      await db().table<User>('user').update({ email }).where({ id: user.id })
    }

    res.send()
  },
)

userRouter.patch('/password',
  ...validate<UpdatePassword>({
    oldPassword: stringValidation,
    newPassword: newPasswordValidation,
  }),
  async (req, res) => {
    const user = req.user
    const { oldPassword, newPassword } = validatorData<UpdatePassword>(req)

    if (!await checkPasswordHash(user.id, oldPassword)) {
      res.sendStatus(403)
      return
    }

    await db().table<User>('user').update({ passwordHash: await argon2.hash(newPassword) }).where({ id: user.id })
    res.send()
  },
)
