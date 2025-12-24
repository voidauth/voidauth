import { parse } from 'psl'

export function getBaseDomain(hostname: string) {
  const parsed = parse(hostname)
  if ('domain' in parsed) {
    return parsed.domain
  } else {
    return null
  }
}
