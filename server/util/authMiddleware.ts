import { isAdmin } from '@shared/user'
import type { Request, Response, NextFunction } from 'express'

export function checkPrivileged(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.user.isPrivileged) {
    res.sendStatus(401)
    return
  }
  next()
}

export function checkAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req.user)) {
    res.sendStatus(403)
    return
  }
  next()
}
