export type valueof<T extends object> = T[keyof T]

export type itemIn<T extends readonly unknown[] | unknown[]> = T[number]

export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>

export type RemoveKeys<T, K extends keyof T> = Omit<T, K> & { [k in K]?: undefined }

export type Nullable<T> = { [K in keyof T]: T[K] | null }

function urlFromWildcardDomain(input: string) {
  const url = URL.parse(`http://${input.replaceAll(/\*+/g, '*').replaceAll('*', '__wildcard__')}`)
  if (!url) {
    return null
  }
  return {
    hostname: url.hostname.replaceAll('__wildcard__', '*'),
    pathname: url.pathname.replaceAll('__wildcard__', '*'),
    href: url.href.replaceAll('__wildcard__', '*'),
    search: url.search,
    hash: url.hash,
    password: url.password,
    username: url.username,
  }
}

export function isValidWildcardDomain(input: string) {
  try {
    const url = urlFromWildcardDomain(input)
    if (!url || url.search || url.hash || url.password || url.username) {
      return false
    }
    return true
  } catch (_e) {
    return false
  }
}

export function formatWildcardDomain(input: string) {
  const url = urlFromWildcardDomain(input) as URL
  const hostname = url.hostname
  let pathname = url.pathname
  if (!pathname.endsWith('*') && pathname.endsWith('/')) {
    pathname += '*'
  }
  return `${hostname}${pathname}`
}

export function sortWildcardDomains(ad: string, bd: string) {
  const a = urlFromWildcardDomain(ad)
  const b = urlFromWildcardDomain(bd)

  if (!a || !b) {
    return +!a - +!b
  }

  const ah = a.hostname
  const bh = b.hostname

  // Check if one domain has more subdomains
  const aSubs = ah.split('.').filter(s => !!s).reverse()
  const bSubs = bh.split('.').filter(s => !!s).reverse()
  const subResult = sortWildcardParts(aSubs, bSubs)
  if (subResult) {
    return subResult
  }

  // Do the same for paths
  const ap = a.pathname
  const bp = b.pathname

  // Check if one path has more subpaths
  const aPaths = ap.split('/').filter(s => !!s)
  const bPaths = bp.split('/').filter(s => !!s)
  const pathResult = sortWildcardParts(aPaths, bPaths)
  if (pathResult) {
    return pathResult
  }

  return b.href.localeCompare(a.href)
}

function sortWildcardParts(aParts: string[], bParts: string[]) {
  // If one has more parts, it is more specific
  if (aParts.length !== bParts.length) {
    return bParts.length - aParts.length
  }

  // Check if one parts has wildcard and if so in what part
  const aWildParts = aParts.filter(sd => sd.includes('*'))
  const bWildParts = bParts.filter(sd => sd.includes('*'))
  if (aWildParts.length || bWildParts.length) {
    // there are wildcards in the parts
    // check if one has more, if so it is LESS specific
    if (aWildParts.length !== bWildParts.length) {
      return aWildParts.length - bWildParts.length
    }

    // check each part individually
    for (let i = 0; i < aParts.length; i++) {
      // check if one has an earlier wildcard part
      // or more wildcards in a part
      const aPart = aParts[i] as string
      const bPart = bParts[i] as string
      const aPartWildCount = aPart.match(new RegExp('\\*', 'g'))?.length ?? 0
      const bPartWildCount = bPart.match(new RegExp('\\*', 'g'))?.length ?? 0
      if (aPartWildCount || bPartWildCount) {
        // This part has wildcard(s)
        // check if one has more, if so it is MORE specific
        if (aPartWildCount !== bPartWildCount) {
          return bPartWildCount - aPartWildCount
        }

        // if not, longer one is more specific
        if (aPart.length !== bPart.length) {
          return bPart.length - aPart.length
        }
      }
    }
  }

  return
}
