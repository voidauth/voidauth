/**
 *
 * @param inserted DB object being inserted
 * @returns A list of keys on inserted that does not included commonly excluded keys
 */
export function mergeKeys<T extends object>(inserted: T): (keyof T)[] {
  const exludedKeys = ['createdAt', 'createdBy']
  return Object.keys(inserted).filter(k => !exludedKeys.includes(k)) as (keyof T)[]
}

export function createExpiration(ttl: number) {
  return (new Date(Date.now() + (ttl * 1000))).toString()
}

export function isExpired(expires: string) {
  return timeToExpiration(expires) < 0
}

export function timeToExpiration(expires: string) {
  return ((new Date(expires)).getTime() - Date.now())
}

export function pastHalfExpired(ttl: number, expires: string) {
  return timeToExpiration(expires) < (ttl * 1000 / 2)
}
