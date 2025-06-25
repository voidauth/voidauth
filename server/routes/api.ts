import { Router, type Request, type Response } from "express"
import { router as interactionRouter } from "./interaction"
import { provider } from "../oidc/provider"
import { commit, createTransaction, db } from "../db/db"
import { getUserById, getUserByInput } from "../db/user"
import { userRouter } from "./user"
import type { Group, UserGroup } from "@shared/db/Group"
import { adminRouter } from "./admin"
import type { UserDetails, UserWithoutPassword } from "@shared/api-response/UserDetails"
import { authRouter } from "./auth"
import { als } from "../util/als"
import { publicRouter } from "./public"
import { oidcLoginPath } from "@shared/oidc"
import appConfig from "../util/config"
import { isMatch } from "matcher"
import { getProxyAuths } from "../db/proxyAuth"
import * as argon2 from "argon2"
import type { User } from "@shared/db/User"

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

// If method is post-put-patch-delete then use transaction
router.use(async (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase())) {
    await createTransaction()
    res.on("finish", async () => {
      await commit()
    })
  }
  next()
})

// proxy auth cache
let proxyAuthCache: { domain: string, groups: string[] }[] = []
let proxyAuthCacheExpires: number = 0

// proxy auth common
async function proxyAuth(url: URL, req: Request, res: Response) {
  const formattedUrl = `${url.hostname}${url.pathname}`

  const ctx = provider.createContext(req, res)
  const sessionId = ctx.cookies.get("x-voidauth-session-uid")
  const authorizationHeader = req.headersDistinct["authorization"]?.[0]
  let user: User | UserWithoutPassword | undefined

  if (sessionId) {
    // Cookie auth flow
    const session = sessionId ? await provider.Session.adapter.findByUid(sessionId) : null
    const accountId = session?.accountId
    user = accountId ? await getUserById(accountId) : undefined
    if (!user) {
      res.redirect(`${appConfig.APP_DOMAIN}${oidcLoginPath(url.href)}`)
      return
    }
  } else if (authorizationHeader) {
    // Authorization header flow
    // Decode the Basic Authorization header
    const [, base64Credentials] = authorizationHeader.split(" ")
    const [username, password] = base64Credentials ? Buffer.from(base64Credentials, "base64").toString().split(":") : []
    user = username ? await getUserByInput(username) : undefined
    if (!user || !password || !await argon2.verify(user.passwordHash, password)) {
      res.setHeader("WWW-Authenticate", `Basic realm="${formattedUrl}"`)
      res.sendStatus(401)
      return
    }
  } else {
    // flow missing, go to login
    res.redirect(`${appConfig.APP_DOMAIN}${oidcLoginPath(url.href)}`)
    return
  }

  const groups = await db().select("name")
    .table<Group>("group")
    .innerJoin<UserGroup>("user_group", "user_group.groupId", "group.id").where({ userId: user.id })
    .orderBy("name", "asc")

  // check if user may access url
  // using a short cache
  if (proxyAuthCacheExpires < new Date().getTime()) {
    proxyAuthCache = await getProxyAuths()

    proxyAuthCacheExpires = new Date().getTime() + 30000 // 30 seconds
  }

  const match = proxyAuthCache.find(d => isMatch(formattedUrl, d.domain))

  if (!match || (match.groups.length && !groups.some(g => match.groups.includes(g.name)))) {
    res.sendStatus(403)
    return
  }

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
}

// proxy cookie auth endpoints
router.get("/authz/forward-auth", async (req: Request, res) => {
  const proto = req.headersDistinct["x-forwarded-proto"]?.[0]
  const host = req.headersDistinct["x-forwarded-host"]?.[0]
  const path = req.headersDistinct["x-forwarded-uri"]?.[0]
  const url = proto && host ? URL.parse(`${proto}://${host}${path ?? ""}`) : null
  if (!url) {
    res.sendStatus(400)
    return
  }
  await proxyAuth(url, req, res)
})

router.get("/authz/auth-request", async (req: Request, res) => {
  const headerUrl = req.headersDistinct["x-original-url"]?.[0]
  const url = headerUrl ? URL.parse(headerUrl) : null
  if (!url) {
    res.sendStatus(400)
    return
  }
  await proxyAuth(url, req, res)
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
          .where({ userId: user.id }).orderBy("name", "asc"))
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

router.get("/cb", (req, res) => {
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

router.use("/public", publicRouter)

router.use("/auth", authRouter)

router.use("/interaction", interactionRouter)

router.use("/user", userRouter)

router.use("/admin", adminRouter)

// API route was not found
router.use((_req, res) => {
  res.sendStatus(404)
  res.end()
})
