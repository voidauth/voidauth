import type { SchemaInfer } from '@shared/utils'
import type { RequestHandler } from 'express'
import type { ParsedQs } from 'qs'
import zod from 'zod'
import { logger } from './logger'

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}): RequestHandler<ShapeOrUndefined<ParamsShape>, any, ShapeOrUndefined<BodyShape>, ShapeOrUndefined<QueryShape>> {
  return (req, res, next) => {
    const errors: Record<string, unknown> = {}
    if (schema.params) {
      const output = zod.object(schema.params).safeParse(req.params)
      if (output.success) {
        req.params = output.data as ShapeOrUndefined<ParamsShape>
      } else {
        errors.params = zod.treeifyError(output.error)
      }
    } else {
      req.params = undefined as ShapeOrUndefined<ParamsShape>
    }

    // Needed to make req.query writable
    Object.defineProperty(req, 'query', { ...Object.getOwnPropertyDescriptor(req, 'query'), value: req.query, writable: true })
    if (schema.query) {
      const output = zod.object(schema.query).safeParse(req.query)
      if (output.success) {
        req.query = output.data as ShapeOrUndefined<QueryShape>
      } else {
        errors.query = zod.treeifyError(output.error)
      }
    } else {
      req.query = undefined as ShapeOrUndefined<QueryShape>
    }

    if (schema.body) {
      const output = zod.object(schema.body).safeParse(req.body)
      if (output.success) {
        req.body = output.data as ShapeOrUndefined<BodyShape>
      } else {
        errors.body = zod.treeifyError(output.error)
      }
    } else {
      req.body = undefined as ShapeOrUndefined<BodyShape>
    }

    if (errors.params || errors.query || errors.body) {
      res.status(422).json(errors)
      logger.debug({ message: 'API Validation failed', path: req.path, method: req.method, error: errors })
      return
    }

    next()
  }
}
