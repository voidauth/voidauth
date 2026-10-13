import type { Request, Response, NextFunction } from 'express'
import { userIsPrivilegedForTotpValidate } from './auth'

export function checkUserExists(req: Pick<Request, 'user'>, res: Response, next: NextFunction) {
  if (!req.user) {
    res.sendStatus(401)
    return
  }
  next()
}

export function checkCanLogin(req: Pick<Request, 'user'>, res: Response, next: NextFunction) {
  if (!req.user) {
    res.sendStatus(401)
    return
  }
  if (!req.user.canLogin) {
    res.sendStatus(403)
    return
  }
  next()
}

export function checkPrivilegedForEmail(req: Pick<Request, 'user'>, res: Response, next: NextFunction) {
  if (!req.user) {
    res.sendStatus(401)
    return
  }
  if (!req.user.isPrivilegedForEmail) {
    res.sendStatus(403)
    return
  }
  next()
}

export function checkPrivilegedForTotpCreate(req: Pick<Request, 'user'>, res: Response, next: NextFunction) {
  if (!req.user) {
    res.sendStatus(401)
    return
  }
  if (!req.user.isPrivilegedForTotpCreate) {
    res.sendStatus(403)
    return
  }
  next()
}

export function checkPrivilegedForTotpValidate(req: Pick<Request, 'user'>, res: Response, next: NextFunction) {
  if (!req.user) {
    res.sendStatus(401)
    return
  }
  if (!userIsPrivilegedForTotpValidate(req.user, req.user.amr)) {
    res.sendStatus(403)
    return
  }
  next()
}

export function checkPrivilegedForPasskeyCreate(req: Pick<Request, 'user'>, res: Response, next: NextFunction) {
  if (!req.user) {
    res.sendStatus(401)
    return
  }
  if (!req.user.isPrivilegedForPasskeyCreate) {
    res.sendStatus(403)
    return
  }
  next()
}

export function checkAdmin(req: Pick<Request, 'user'>, res: Response, next: NextFunction) {
  if (!req.user) {
    res.sendStatus(401)
    return
  }
  if (!req.user.isAdmin) {
    res.sendStatus(403)
    return
  }
  next()
}
