import { USERNAME_REGEX } from '@shared/constants'
import type { NextFunction, Request, Response } from 'express'
import appConfig from './config'
import { isAdmin } from '@shared/user'
import { passwordStrength } from './zxcvbn'

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

export const unlessNull = {
  UnlessNull: {
    if: (value: unknown) => value !== null,
    custom: () => true,
  },
}

export const stringValidation = { isString: true, stripLow: true, trim: true } as const
export const uuidValidation = { ...stringValidation, isUUID: true } as const
export const emailValidation = {
  isEmail: {
    options: {
      require_tld: false,
    },
  },
  lowerCase: {
    customSanitizer: (input: unknown) => {
      if (typeof input === 'string') {
        return input.toLowerCase()
      }
      return input
    },
  },
  trim: true,
} as const

export const usernameValidation = {
  ...stringValidation,
  matches: { options: USERNAME_REGEX },
} as const

export const nameValidation = {
  default: {
    options: null,
  },
  optional: true,
  ...unlessNull,
  ...stringValidation,
  isLength: {
    options: {
      min: 3,
      max: 64,
    },
  },
} as const

export const newPasswordValidation = {
  ...stringValidation,
  zxcvbn: {
    custom: (value: unknown) => {
      return typeof value === 'string' && passwordStrength(value).score >= appConfig.PASSWORD_STRENGTH
    },
  },
} as const
