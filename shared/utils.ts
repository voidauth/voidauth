import type zod from 'zod'

export type ValueOf<T extends object> = T[keyof T]

export type ItemIn<T extends readonly unknown[] | unknown[]> = T[number]

export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>

export type RemoveKeys<T, K extends keyof T> = Omit<T, K> & { [k in K]?: undefined }

export type Nullable<T> = { [K in keyof T]: T[K] | null }

export type OptionalizedNullable<T> = {
  [K in keyof T]: null extends T[K] ? Exclude<T[K], null> | undefined : T[K]
}

export function optionalizeNullable<T extends object>(input: T) {
  if (typeof input !== 'object') {
    throw new Error('input must be an object')
  }

  const result: Partial<OptionalizedNullable<T>> = {}

  for (const key of Object.keys(input) as (keyof T)[]) {
    result[key] = (input[key] ?? undefined) as OptionalizedNullable<T>[typeof key]
  }

  return result as OptionalizedNullable<T>
}

export type SchemaInfer<T extends zod.ZodRawShape> = zod.infer<zod.ZodObject<T>>

export type SchemaInferInput<T extends zod.ZodRawShape> = zod.input<zod.ZodObject<T>>

export function humanDuration(ms: number): string {
  const negative = ms < 0
  ms = Math.abs(ms)
  const result = humanDurationHelper(ms)
  if (!result) {
    return 'now'
  }
  return negative ? `${result} ago` : result
}

function humanDurationHelper(ms: number): string | null {
  const MINUTE = 60
  const HOUR = MINUTE * 60
  const DAY = HOUR * 24
  const WEEK = DAY * 7
  const YEAR = DAY * 365.25
  const MONTH = YEAR / 12

  const seconds = Math.round(ms / 1000)
  const years = Math.round(seconds / YEAR)
  const months = Math.round(seconds / MONTH)
  const weeks = Math.round(seconds / WEEK)
  const days = Math.round(seconds / DAY)
  const hours = Math.round(seconds / HOUR)
  const minutes = Math.round(seconds / MINUTE)

  if (months > 11) {
    return String(years) + ' year' + ((years > 1) ? 's' : '')
  }

  if (weeks > 4) {
    return String(months) + ' month' + ((months > 1) ? 's' : '')
  }

  if (days > 6) {
    return String(weeks) + ' week' + ((weeks > 1) ? 's' : '')
  }

  if (hours > 23) {
    return String(days) + ' day' + ((days > 1) ? 's' : '')
  }

  if (minutes > 59) {
    return String(hours) + ' hour' + ((hours > 1) ? 's' : '')
  }

  if (seconds > 59) {
    return String(minutes) + ' minute' + ((minutes > 1) ? 's' : '')
  }

  if (ms > 999) {
    return String(seconds) + ' second' + ((seconds > 1) ? 's' : '')
  }
  return null
}
