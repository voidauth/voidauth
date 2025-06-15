/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextFunction, Request, Response } from "express"
import { checkSchema, validationResult, type ParamSchema } from "express-validator"

type IsGenericKey<T> = string extends T ? true : number extends T ? true : false

type ExcludeGenericKeys<T> = {
  [K in keyof T as IsGenericKey<K> extends true ? never : K]: T[K];
}

// type OnlyGenericKeys<T> = {
//   [K in keyof T as IsGenericKey<K> extends false ? never : K]: T[K];
// };

type IsOptionalKey<T, K extends keyof T> = T extends Record<K, T[K]> ? false : true

// type DotNotation<T> = any extends T ? never : T extends (infer U)[]
//   ? ('*' | `${`*.${DotNotation<U>}`}`)
//   : T extends object
//   ? { [K in keyof ExcludeGenericKeys<T>]-?:
//     `${IsOptionalKey<T, K> extends false ? K : `${K}?`}`
//     |
//     `${IsOptionalKey<T, K> extends false ? K : `${K}?`}${`.${DotNotation<T[K]>}`}`

//   }[keyof ExcludeGenericKeys<T>]
//   : never;

type DotNotation<T> = any extends T
  ? never
  : T extends (infer U)[]
    ? U extends object
      ? `*.${DotNotation<U>}`
      : "*"
    : T extends object
      ? { [K in keyof ExcludeGenericKeys<T>]-?: (
          Required<T>[K] extends object
            ? Required<T>[K] extends (infer _V)[]
              // eslint-disable-next-line @stylistic/indent-binary-ops
              ? `${IsOptionalKey<T, K> extends false ? K : `${K}?`}`
              |
              // eslint-disable-next-line @stylistic/indent-binary-ops
              `${IsOptionalKey<T, K> extends false ? K : `${K}?`}${`.${DotNotation<T[K]>}`}`
              : `${IsOptionalKey<T, K> extends false ? K : `${K}?`}${`.${DotNotation<T[K]>}`}`
            : `${IsOptionalKey<T, K> extends false ? K : `${K}?`}`
        ) }[keyof ExcludeGenericKeys<T>]
      : never

type WasOptionalKey<T extends string> = T extends `${infer _A}?${infer _B}`
  ? true
  : IsGenericKey<T> extends true
    ? true
    : false

type FixOptionalKey<T extends string> = T extends `${infer A}?${infer B}` ? FixOptionalKey<`${A}${B}`> : T

export type TypedSchema<T extends object> = {
  [K in DotNotation<T> as WasOptionalKey<K> extends false ? K : never]: ParamSchema<any>
} & {
  [K in DotNotation<T> as WasOptionalKey<K> extends true ? FixOptionalKey<K> : never]?: ParamSchema<any>
}

export function validate<T extends object = any>(schema: TypedSchema<T> | TypedSchema<T>[]) {
  const schemas: TypedSchema<T>[] = (schema instanceof Array ? schema : [schema])
  return [
    ...schemas.map((s) => {
      return checkSchema(s, ["body", "params", "query"])
    }),
    handleValidatorError,
  ]
}

function handleValidatorError(req: Request, res: Response, next: NextFunction) {
  const result = validationResult(req).array()
  if (result.length) {
    res.status(422).send(result)
  } else {
    next()
  }
}
