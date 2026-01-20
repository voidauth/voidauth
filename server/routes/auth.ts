import { Router } from 'express'
import { getUserById } from '../db/user'
import appConfig from '../util/config'
import { createEmailVerification } from './interaction'
import { getInvitation } from '../db/invitations'
import { zodValidate } from '../util/validate'
import zod from 'zod'

export const authRouter = Router()

authRouter.post('/send_verify_email',
  zodValidate<{ id: string }>({
    id: zod.uuidv4(),
  }, async (req, res) => {
    if (!appConfig.EMAIL_VERIFICATION) {
      res.sendStatus(400)
      return
    }
    const { id } = req.validatedData

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
  }))

authRouter.get('/invitation/:id/:challenge',
  zodValidate<{ id: string, challenge: string }>({
    id: zod.string(),
    challenge: zod.string(),
  }, async (req, res) => {
    const { id, challenge } = req.validatedData
    const invite = await getInvitation(id)
    if (!invite || invite.challenge != challenge) {
      res.sendStatus(404)
      return
    }

    res.send(invite)
  }))
