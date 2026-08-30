import type zod from 'zod'

export type ValueOf<T extends object> = T[keyof T]

export type ItemIn<T extends readonly unknown[] | unknown[]> = T[number]

export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>

// makes the specified keys optional or undefined, while keeping the rest of the type intact
export type RemoveKeys<T, K extends keyof T> = Omit<T, K> & { [k in K]?: undefined }

// makes all keys of a type that are NOT specified optional or undefined
export type OnlyKeys<T, K extends keyof T> = RemoveKeys<T, Exclude<keyof T, K>>

// Converts a type Source to a type Target, keeping only the keys that exist in both Source and Target, and merging with Target
// Enables exact conversion between Source and Target types
export type Convert<Source extends Target, Target> = OnlyKeys<Source, Extract<keyof Target, keyof Source>> & Target

// makes all properties of a type nullable
export type Nullable<T> = { [K in keyof T]: T[K] | null }

// Returns input type but all properties that are nullable are now optional and not nullable
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

export function stringCompare(a: string, b: string, options?: Intl.CollatorOptions): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', ...options })
}

type DurationUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

type DurationResult = {
  unit: DurationUnit
  count: number
}

export function getDurationResult(milliseconds: number): DurationResult | null {
  const minute = 60
  const hour = minute * 60
  const day = hour * 24
  const week = day * 7
  const year = day * 365.25
  const month = year / 12

  const seconds = Math.round(milliseconds / 1000)
  const years = Math.round(seconds / year)
  const months = Math.round(seconds / month)
  const weeks = Math.round(seconds / week)
  const days = Math.round(seconds / day)
  const hours = Math.round(seconds / hour)
  const minutes = Math.round(seconds / minute)

  if (months > 11) {
    return { unit: 'year', count: years }
  }

  if (weeks > 4) {
    return { unit: 'month', count: months }
  }

  if (days > 6) {
    return { unit: 'week', count: weeks }
  }

  if (hours > 23) {
    return { unit: 'day', count: days }
  }

  if (minutes > 59) {
    return { unit: 'hour', count: hours }
  }

  if (seconds > 59) {
    return { unit: 'minute', count: minutes }
  }

  if (milliseconds > 999) {
    return { unit: 'second', count: seconds }
  }

  return null
}

export function getEnglishDuration(milliseconds: number): string {
  const result = getDurationResult(milliseconds)
  if (!result) {
    return 'now'
  }

  const { unit, count } = result
  const plural = count > 1 ? 's' : ''
  return `${String(count)} ${unit}${plural}`
}
