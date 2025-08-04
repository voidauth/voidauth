import { Router } from 'express'
import { validate, validatorData } from '../util/validate'
import { getUserById } from '../db/user'
import appConfig from '../util/config'
import { stringValidation, uuidValidation } from '../util/validators'
import { createEmailVerification } from './interaction'
import { getInvitation } from '../db/invitations'

export const authRouter = Router()

authRouter.post('/send_verify_email',
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req, res) => {
    if (!appConfig.EMAIL_VERIFICATION) {
      res.sendStatus(400)
      return
    }
    const { id } = validatorData<{ id: string }>(req)

    const user = await getUserById(id)

    if (!user) {
      res.sendStatus(404)
      return
    }

    const sent = await createEmailVerification(user)
    if (!sent) {
      res.status(400).send({ message: 'Verification Email could not be sent.' })
      return
    }

    res.send()
    return
  },
)

authRouter.get('/invitation/:id/:challenge',
  ...validate<{ id: string, challenge: string }>({
    id: stringValidation,
    challenge: stringValidation,
  }),
  async (req, res) => {
    const { id, challenge } = validatorData<{ id: string, challenge: string }>(req)
    const invite = await getInvitation(id)
    if (!invite || invite.challenge != challenge) {
      res.sendStatus(404)
      return
    }

    res.send(invite)
  },
)
