import { ADMIN_GROUP, USERNAME_REGEX } from '@shared/constants'
import type { NextFunction, Request, Response } from 'express'
import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core'
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common'
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en'
import appConfig from './config'
import type { ParamSchema } from 'express-validator'

const options = {
  // recommended
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
  },
  // recommended
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  // recommended
  useLevenshteinDistance: true,
}

zxcvbnOptions.setOptions(options)

export function checkLoggedIn(req: Request, res: Response, next: NextFunction) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!req.user) {
    res.sendStatus(401)
    return
  }
  next()
}

export function checkAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user.groups.some(g => g === ADMIN_GROUP)) {
    res.sendStatus(403)
    return
  }
  next()
}

export const optionalNull: ParamSchema = {
  optional: {
    options: {
      values: 'null',
    },
  },
} as const

export const stringValidation: ParamSchema = { isString: true, stripLow: true, trim: true } as const
export const uuidValidation: ParamSchema = { ...stringValidation, isUUID: true } as const
export const emailValidation: ParamSchema = {
  isEmail: {
    options: {
      require_tld: false,
    },
  }, normalizeEmail: true, trim: true,
} as const

export const usernameValidation: ParamSchema = {
  ...stringValidation,
  matches: { options: USERNAME_REGEX },
} as const

export const nameValidation: ParamSchema = {
  default: {
    options: null,
  },
  optional: {
    options: {
      values: 'null',
    },
  },
  ...stringValidation,
  matches: { options: /^[\w\s]{4,64}$/ },
} as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const newPasswordValidation: ParamSchema<any> = {
  ...stringValidation,
  zxcvbn: {
    custom: (value: unknown) => {
      return typeof value === 'string' && zxcvbn(value).score >= appConfig.PASSWORD_STRENGTH
    },
  },
} as const
