/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SchemaInfer } from '@shared/utils'
import type { NextFunction, Request, Response } from 'express'
import zod from 'zod'

type ZodStringInputShape = Readonly<{
  [k: string]: zod.ZodType<unknown, string | undefined>
}>

type ShapeOrUndefined<T extends zod.ZodRawShape | undefined> = T extends zod.ZodRawShape ? SchemaInfer<T> : undefined

type ControllerHandler<BodyShape, QueryShape, ParamsShape> = (
  req: Omit<Request, 'body' | 'query' | 'params'> & { body: BodyShape, query: QueryShape, params: ParamsShape },
  res: Response,
  next: NextFunction,
) => Promise<void> | void

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
 * }, (req, res) => {
 *
 *   const body = req.body;
 *   // body.a is a uuidv4 string
 *   // body.c is { q: string[], r: number | undefined }
 *
 *   const params = req.params
 *   // params.b is a number or undefined
 *
 *   res.status(200).json({ message: 'Success' })
 * }));
 */
export function zodValidate<
  BodyShape extends zod.ZodRawShape | undefined = undefined,
  QueryShape extends ZodStringInputShape | undefined = undefined,
  ParamsShape extends ZodStringInputShape | undefined = undefined,
>(
  schema: {
    body?: BodyShape
    query?: QueryShape
    params?: ParamsShape
  },
  controller: ControllerHandler<
    ShapeOrUndefined<BodyShape>,
    ShapeOrUndefined<QueryShape>,
    ShapeOrUndefined<ParamsShape>
  >) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (schema.body) {
      const output = await zod.object(schema.body).safeParseAsync(req.body)
      if (!output.success) {
        res.status(422).json(zod.treeifyError(output.error))
        return
      }
      req.body = output.data
    } else {
      req.body = undefined
    }

    Object.defineProperty(req, 'query', { ...Object.getOwnPropertyDescriptor(req, 'query'), value: req.query, writable: true })
    if (schema.query) {
      const output = await zod.object(schema.query).safeParseAsync(req.query)
      if (!output.success) {
        res.status(422).json(zod.treeifyError(output.error))
        return
      }
      req.query = output.data as any
    } else {
      req.query = undefined as any
    }

    if (schema.params) {
      const output = await zod.object(schema.params).safeParseAsync(req.params)
      if (!output.success) {
        res.status(422).json(zod.treeifyError(output.error))
        return
      }
      req.params = output.data as any
    } else {
      req.params = undefined as any
    }

    await controller(req as Parameters<typeof controller>[0], res, next)
  }
}
