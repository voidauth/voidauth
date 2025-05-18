import { ADMIN_GROUP, USERNAME_REGEX } from "@shared/constants"
import type { ValidParamSchema } from "./validate"
import type { NextFunction, Request, Response } from "express"
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core"
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common"
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en"
import appConfig from "./config"

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

export const optionalNull: ValidParamSchema = {
  optional: {
    options: {
      values: "null",
    },
  },
} as const

export const stringValidation: ValidParamSchema = { isString: true, stripLow: true, trim: true } as const
export const uuidValidation: ValidParamSchema = { ...stringValidation, isUUID: true } as const
export const emailValidation: ValidParamSchema = {
  isEmail: {
    options: {
      require_tld: false,
    },
  }, normalizeEmail: true, trim: true,
} as const

export const usernameValidation: ValidParamSchema = {
  ...stringValidation,
  matches: { options: USERNAME_REGEX },
} as const

export const nameValidation: ValidParamSchema = {
  default: {
    options: null,
  },
  optional: {
    options: {
      values: "null",
    },
  },
  ...stringValidation,
  matches: { options: /^[\w\s]{4,64}$/ },
} as const

export const newPasswordValidation: ValidParamSchema = {
  ...stringValidation,
  zxcvbn: {
    custom: (value: unknown) => {
      return typeof value === "string" && zxcvbn(value).score >= appConfig.ZXCVBN_MIN
    },
  },
} as const
