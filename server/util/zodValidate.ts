/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SchemaInfer } from '@shared/utils'
import type { RequestHandler } from 'express'
import type { ParsedQs } from 'qs'
import zod from 'zod'

// Enforce proper typing of params and query inputs
type ZodParamsShape = {
  [k: string]: zod.ZodType<unknown, string | string[] | undefined>
  [k: number]: zod.ZodType<unknown, string | undefined>
}
type ZodQueryShape = {
  [k: string]: zod.ZodType<unknown, undefined | string | ParsedQs | (string | ParsedQs)[]>
}

type ShapeOrUndefined<T extends zod.ZodRawShape | undefined> = T extends zod.ZodRawShape ? SchemaInfer<T> : undefined

/**
 * Validation middleware using zod schemas to parse and validate Request data.
 * Only validated fields will be present on resulting Request body, query, and params properties.
 * @param schema validated fields from the Request locations using zod schema validators
 * @param schema.body fields on the request body to be validated
 * @param schema.query fields on the request query to be validated
 * @param schema.params fields on the request params to be validated
 * @param controller callback function in the form of express middleware to handle the Request after validation
 * @example
 * app.post('/api/resource{/:b}', zodValidate({
 *   body: {
 *     a: z.uuidv4(), // 'a' should be a uuidv4
 *     c: z.object({
 *       q: z.array(zod.string()),
 *       r: z.number().optional()
 *     }
 *   },
 *   params: {
 *     b: z.coerce.number().optional() // b must be coerced into a number, 'query' and 'params' fields are always strings
 *   })
 * }), (req, res) => {
 *
 *   const body = req.body;
 *   // body.a is a uuidv4 string
 *   // body.c is { q: string[], r: number | undefined }
 *
 *   const params = req.params
 *   // params.b is a number or undefined
 *
 *   res.status(200).json({ message: 'Success' })
 * });
 */
export function zodValidate<
  BodyShape extends zod.ZodRawShape | undefined = undefined,
  QueryShape extends ZodQueryShape | undefined = undefined,
  ParamsShape extends ZodParamsShape | undefined = undefined,
>(schema: {
  body?: BodyShape
  query?: QueryShape
  params?: ParamsShape
}): RequestHandler<ShapeOrUndefined<ParamsShape>, any, ShapeOrUndefined<BodyShape>, ShapeOrUndefined<QueryShape>> {
  return (req, res, next) => {
    if (schema.params) {
      const output = zod.object(schema.params).safeParse(req.params)
      if (!output.success) {
        res.status(422).json(zod.treeifyError(output.error))
        return
      }
      req.params = output.data as any
    } else {
      req.params = undefined as any
    }

    // Needed to make req.query writable
    Object.defineProperty(req, 'query', { ...Object.getOwnPropertyDescriptor(req, 'query'), value: req.query, writable: true })
    if (schema.query) {
      const output = zod.object(schema.query).safeParse(req.query)
      if (!output.success) {
        res.status(422).json(zod.treeifyError(output.error))
        return
      }
      req.query = output.data as any
    } else {
      req.query = undefined as any
    }

    if (schema.body) {
      const output = zod.object(schema.body).safeParse(req.body)
      if (!output.success) {
        res.status(422).json(zod.treeifyError(output.error))
        return
      }
      req.body = output.data as any
    } else {
      req.body = undefined as any
    }

    next()
  }
}
