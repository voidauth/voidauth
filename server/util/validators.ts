import { ADMIN_GROUP, USERNAME_REGEX } from "@shared/constants"
import type { ValidParamSchema } from "./validate"
import type { NextFunction, Request, Response } from "express"

export function checkLoggedIn(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.sendStatus(401)
    return
  }
  next()
}

export function checkAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.groups?.some((g) => g === ADMIN_GROUP)) {
    res.sendStatus(403)
    return
  }
  next()
}

export const defaultNull: ValidParamSchema = {
  default: {
    options: null
  }
}

export const allowNull: ValidParamSchema = {
  allowNull: {
    custom: () => { return true },
    if: (value: any) => {
      return value !== null
    },
  }
}

export const stringValidation: ValidParamSchema = { isString: true, stripLow: true, trim: true }
export const uuidValidation: ValidParamSchema = { ...stringValidation, isUUID: true }
export const emailValidation: ValidParamSchema = {
  isEmail: {
    options: {
      require_tld: false,
    }
  }, normalizeEmail: true, trim: true
}

export const usernameValidation: ValidParamSchema = {
  ...stringValidation,
  matches: { options: USERNAME_REGEX },
}

export const nameValidation: ValidParamSchema = {
  ...defaultNull,
  ...allowNull,
  optional: true,
  ...stringValidation,
  matches: { options: /^[\w\s]{4,64}$/ },
}