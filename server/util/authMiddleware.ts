import type { Request, Response, NextFunction } from 'express'
import { userIsPrivilegedForEmail, userIsPrivilegedForTotpCreate, userIsPrivilegedForTotpValidate } from './auth'

export function checkUserExists(req: Pick<Request, 'user'>, res: Response, next: NextFunction) {
  if (!req.user) {
    res.sendStatus(401)
    return
  }
  next()
}

export function checkPrivileged(req: Pick<Request, 'user'>, res: Response, next: NextFunction) {
  if (!req.user) {
    res.sendStatus(401)
    return
  }
  if (!req.user.isPrivileged) {
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
  if (!userIsPrivilegedForEmail(req.user, req.user.amr)) {
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
  if (!userIsPrivilegedForTotpCreate(req.user, req.user.amr)) {
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
