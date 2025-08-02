/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextFunction, Request, Response } from 'express'
import { checkSchema, matchedData, validationResult, type CustomSanitizer, type CustomValidator, type ParamSchema } from 'express-validator'
import type { ExtensionValidatorSchemaOptions } from 'express-validator/lib/middlewares/schema'

type IsGenericKey<T> = string extends T ? true : number extends T ? true : false

type ExcludeGenericKeys<T> = {
  [K in keyof T as IsGenericKey<K> extends true ? never : K]: T[K];
}

type IsOptionalKey<T, K extends keyof T> = T extends Record<K, T[K]> ? false : true

type DotNotation<T> = any extends T
  ? never
  : T extends (infer U)[]
    ? U extends object
      ? `*.${DotNotation<U>}`
      : '*'
    : T extends object
      ? { [K in keyof ExcludeGenericKeys<T>]-?: (
          Required<T>[K] extends object
            ? Required<T>[K] extends (infer _V)[]
              ? (`${IsOptionalKey<T, K> extends false ? K : `${K}?`}` | `${IsOptionalKey<T, K> extends false ? K : `${K}?`}${`.${DotNotation<T[K]>}`}`)
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

export type SchemaValues = ParamSchema
  | { [k: string]: (Exclude<ExtensionValidatorSchemaOptions, boolean> | { custom: CustomValidator })
    | { customSanitizer: CustomSanitizer } }

export type TypedSchema<T extends object> = {
  [K in DotNotation<T> as WasOptionalKey<K> extends false ? K : never]: SchemaValues
} & {
  [K in DotNotation<T> as WasOptionalKey<K> extends true ? FixOptionalKey<K> : never]?: SchemaValues & { optional: ParamSchema['optional'] }
}

export function validate<T extends object = any>(schema: TypedSchema<T>) {
  return [
    ...checkSchema(schema, ['body', 'params', 'query']).flat(),
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

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function validatorData<T extends object = Record<string, any>>(req: Request) {
  return matchedData<T>(req, { includeOptionals: false, onlyValidData: true })
}
