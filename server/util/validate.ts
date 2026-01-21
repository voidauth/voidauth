import type { NextFunction, Request, Response } from 'express'
import zod from 'zod'

declare module 'express' {
  interface Request {
    validatedData?: unknown
  }
}

// detect if T is a vague key ('string' or 'number')
type IsVagueKey<T> = string extends T ? true : number extends T ? true : false

// keys in T that are vague ('string' or 'number') like 'string' from { [key: string]: any }
type VagueKeys<T> = {
  [K in keyof T]: IsVagueKey<K> extends true ? K : never
}[keyof T]

// detect if T is any
type IsAny<T> = 0 extends (1 & T) ? true : false

// keys in T that are of type 'any', not including any with vague index signatures ('string', 'number')
type AnyKeys<T> = Exclude<{
  [K in keyof T]: IsAny<T[K]> extends true ? K : never
}[keyof T], VagueKeys<T>>

// keys that are 'regular' in T, not vague or type any
type RegularKeys<T> = Exclude<{ [K in keyof T]: K }[keyof T], AnyKeys<T> | VagueKeys<T>>

type ShapeOptional<T> = undefined extends T
  ? null extends T
    ? zod.ZodOptional<zod.ZodNullable<zod.ZodType<T>>>
    : zod.ZodOptional<zod.ZodType<T>>
  : null extends T
    ? zod.ZodNullable<zod.ZodType<T>>
    : zod.ZodType<T>

// // keys in T that are optional (not including vague keys or those with type 'any')
// type OptionalKeys<T> = Exclude<{
//   [K in keyof T]-?: undefined extends T[K] ? K : never
// }[keyof T], AnyKeys<T> | VagueKeys<T>>

// // keys in T that are Required
// type RequiredKeys<T> = Exclude<keyof T, OptionalKeys<T> | VagueKeys<T> | AnyKeys<T>>

export type SchemaShape<T extends object | undefined> = T extends object ? {
  [K in AnyKeys<T>]-?: zod.ZodType<T[K]>
} & {
  [K in VagueKeys<T>]: zod.ZodType<T[K]> | zod.ZodOptional<zod.ZodType<T[K]>>
} & {
  [K in RegularKeys<T>]-?: ShapeOptional<T[K]>
} : undefined

type ControllerHandler<T> = (
  req: Omit<Request, 'validatedData'> & { validatedData: T },
  res: Response,
  next: NextFunction,
) => Promise<void> | void

/**
 * Validation middleware using zod schemas to parse and validate Request data.
 * Validated data may be retrieved on the Request.validatedData property.
 * @param schema validated fields from the Request locations using zod schema validators
 * @param controller callback function in the form of express middleware to handle the Request after validation
 * @param locations properties of the Request to validate and add to validatedData.
 * Defaults to all locations. Location priority is 'params' > 'query' > 'body'
 * @example
 * app.post('/api/resource{/:b}', validateController<{ a: string, b?: number, c: { q: string[], r?: number } }>({
 *   a: z.uuidv4(), // 'a' should be a uuidv4
 *   b: z.coerce.number().optional() // b must be coerced into a number, 'query' and 'params' fields are always strings
 *   c: z.object({
 *     q: z.array(zod.string()),
 *     r: z.number().optional()
 *   })
 * }, (req, res) => {
 *   const data = req.validatedData;
 *   // data.a is a uuidv4 string
 *   // data.b is a number or undefined
 *   // data.c is { q: string[], r: number | undefined }
 *
 *   res.status(200).json({ message: 'Success' })
 * }));
 */
export function zodValidate<T extends object | undefined>(
  schema: SchemaShape<T>,
  controller: ControllerHandler<T>,
  locations: ('body' | 'query' | 'params')[] = ['params', 'query', 'body']) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const inputs: object = {}
    if (locations.includes('body')) {
      Object.assign(inputs, req.body)
    }
    if (locations.includes('query')) {
      Object.assign(inputs, req.query)
    }
    if (locations.includes('params')) {
      Object.assign(inputs, req.params)
    }
    const output = await zod.object(schema).safeParseAsync(inputs)
    if (!output.success) {
      res.status(422).json(zod.treeifyError(output.error))
      return
    }
    req.validatedData = output.data
    await controller(req as Parameters<typeof controller>[0], res, next)
  }
}
