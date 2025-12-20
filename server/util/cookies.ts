import { parse } from 'psl'

export function getBaseDomain(hostname: string) {
  const parsed = parse(hostname)
  if ('tld' in parsed) {
    return parsed.listed ? parsed.domain : parsed.tld
  } else {
    return null
  }
}
