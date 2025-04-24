import { Router, type Request, type Response } from "express"
import { validate } from "../util/validate"
import { matchedData } from "express-validator"
import { getUserById } from "../db/user"
import appConfig from "../util/config"
import { stringValidation, uuidValidation } from "../util/validators"
import { createEmailVerification } from "./interaction"
import { getInvitation } from "../db/invitations"

export const authRouter = Router()

authRouter.post('/send_verify_email',
  ...validate<{ id: string }>({
    id: uuidValidation,
  }),
  async (req: Request, res: Response) => {
    if (!appConfig.EMAIL_VERIFICATION) {
      res.sendStatus(400)
      return
    }
    const { id } = matchedData<{ id: string }>(req)

    let user = await getUserById(id)

    if (!user) {
      res.sendStatus(404)
      return
    }

    await createEmailVerification(user)

    res.send()
    return
  }
)

authRouter.get("/invitation/:id/:challenge",
  ...validate<{id: string, challenge: string}>({
    id: stringValidation,
    challenge: stringValidation
  }),
  async (req: Request, res: Response) => {
    const { id, challenge } = matchedData<{id: string, challenge: string}>(req)
    const invite = await getInvitation(id)
    if (!invite || invite.challenge != challenge) {
      res.sendStatus(404)
      return
    }

    res.send(invite)
  }
)
