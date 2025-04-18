import { Router, type Request, type Response } from "express";
import { router as interactionRouter } from "./interaction";
import { provider } from "../oidc/provider";
import { db } from "../db/db";
import { getUserById } from "../db/user";
import { userRouter } from "./user";
import type { ConfigResponse } from "@shared/api-response/ConfigResponse";
import appConfig from "../util/config";
import type { Group, UserGroup } from "@shared/db/Group";
import { adminRouter } from "./admin";
import { SMTP_VERIFIED } from "../util/email";
import type { UserDetails } from "@shared/api-response/UserDetails";
import { authRouter } from "./auth";
import { doubleCsrf } from "csrf-csrf";

declare global {
  namespace Express {
      interface Request {
        user: UserDetails
      }
  }
}

export const router = Router()

// Set up csrf protection
const {
  generateToken, // Use this in your routes to provide a CSRF hash + token cookie and token.
  doubleCsrfProtection, // This is the default CSRF protection middleware.
} = doubleCsrf({
  // TODO: use generated secret from DB (keygrip?)
  getSecret: () => { return "123" },
  cookieName: "__Host.x-csrf-token",
  cookieOptions: {
    httpOnly: false
  },
  getTokenFromRequest: (req) => {
    let header = req.headers["x-xsrf-token"]
    if (Array.isArray(header)) {
      header = header?.[0]
    }
    return header?.split('|')[0]
  }
});

// use csrf protection
router.use(
  (req, res, next) => {
  generateToken(req, res)
  next()
}, 
doubleCsrfProtection)

// Set user on reqest
router.use(async (req: Request, res, next) => {
  try {
    const ctx = provider.app.createContext(req, res)
    const session = await provider.Session.get(ctx)
    if (!session?.accountId) {
      next()
      return
    }

    const user = await getUserById(session.accountId)

    if (user) {
      req.user = { 
        ...user,
        groups: (await db.select().table<UserGroup>("user_group").innerJoin<Group>("group", "user_group.groupId", "group.id").where({ userId: user.id })).map((g) => {
          return g.name
        })
      }
    }
  } catch (e) {
    // do nothing
  }
  next()
})

router.use("/auth", authRouter)

router.use("/interaction", interactionRouter)

router.use("/user", userRouter)

router.use("/admin", adminRouter)

router.get("/status", (req: Request, res: Response) => {
  const { error, error_description, iss } = req.query
  if (error) {
    res.status(500).send({
      error,
      error_description,
      iss
    })
    return
  }
  res.redirect("/")
})

router.get("/config", (req, res) => {
  const configResponse: ConfigResponse = {
    emailActive: SMTP_VERIFIED,
    emailVerification: appConfig.EMAIL_VERIFICATION,
    registration: appConfig.SIGNUP
  }

  res.send(configResponse)
})

// API route was not found
router.use((req, res) => {
  res.sendStatus(404)
  res.end()
})
