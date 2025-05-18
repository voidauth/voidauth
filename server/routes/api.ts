import { Router, type Request } from "express"
import { router as interactionRouter } from "./interaction"
import { provider } from "../oidc/provider"
import { db } from "../db/db"
import { getUserById } from "../db/user"
import { userRouter } from "./user"
import type { Group, UserGroup } from "@shared/db/Group"
import { adminRouter } from "./admin"
import type { UserDetails } from "@shared/api-response/UserDetails"
import { authRouter } from "./auth"
import { als } from "../util/als"
import { publicRouter } from "./public"
import appConfig from "../util/config"

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: UserDetails
    }
  }
}

export const router = Router()

router.use((_req, _res, next) => {
  als.run({}, () => {
    next()
  })
})

// proxy cookie auth endpoint
router.get("/verify", async (req: Request, res) => {
  const ctx = provider.createContext(req, res)
  const sessionId = ctx.cookies.get("x-void-auth-session-uid")
  if (!sessionId) {
    res.redirect(appConfig.APP_DOMAIN)
    return
  }
  const session = await provider.Session.adapter.findByUid(sessionId)
  const accountId = session?.accountId
  if (!accountId) {
    res.redirect(appConfig.APP_DOMAIN)
    return
  }

  const user = await getUserById(accountId)

  if (!user) {
    res.redirect(appConfig.APP_DOMAIN)
    return
  }

  const groups = await db().select("name")
    .table<Group>("group")
    .innerJoin<UserGroup>("user_group", "user_group.groupId", "group.id").where({ userId: user.id })

  res.setHeader("Remote-User", user.username)
  if (user.email) {
    res.setHeader("Remote-Email", user.email)
  }
  if (user.name) {
    res.setHeader("Remote-Name", user.name)
  }
  if (groups.length) {
    res.setHeader("Remote-Groups", groups.map(g => g.name).join(","))
  }
  res.send()
})

// Set user on reqest
router.use(async (req: Request, res, next) => {
  try {
    const ctx = provider.createContext(req, res)
    const session = await provider.Session.get(ctx)
    if (!session.accountId) {
      next()
      return
    }

    const user = await getUserById(session.accountId)

    if (user) {
      req.user = {
        ...user,
        groups: (await db().select()
          .table<UserGroup>("user_group")
          .innerJoin<Group>("group", "user_group.groupId", "group.id")
          .where({ userId: user.id }))
          .map((g) => {
            return g.name
          }),
      }
    }
  } catch (_e) {
    // do nothing
  }
  next()
})

router.use("/public", publicRouter)

router.use("/auth", authRouter)

router.use("/interaction", interactionRouter)

router.use("/user", userRouter)

router.use("/admin", adminRouter)

router.get("/status", (req, res) => {
  const { error, error_description, iss } = req.query
  if (error) {
    res.status(500).send({
      error,
      error_description,
      iss,
    })
    return
  }
  res.redirect("/")
})

// API route was not found
router.use((_req, res) => {
  res.sendStatus(404)
  res.end()
})
