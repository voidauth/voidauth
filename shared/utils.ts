export type valueof<T extends object> = T[keyof T]

export type itemIn<T extends readonly unknown[] | unknown[]> = T[number]

export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>

export type RemoveKeys<T, K extends keyof T> = Omit<T, K> & { [k in K]?: undefined }

export type Nullable<T> = { [K in keyof T]: T[K] | null }

export function isValidWildcardDomain(input: string) {
  try {
    new URL(`http://${input.replaceAll("*", "a")}`)
    return true
  } catch (_e) {
    return false
  }
}

export function sortWildcardDomains(ad: string, bd: string) {
  const a = URL.parse(`http://${ad.replaceAll(/\*+/g, "*").replaceAll("*", "__wildcard__")}`)
  const b = URL.parse(`http://${bd.replaceAll(/\*+/g, "*").replaceAll("*", "__wildcard__")}`)

  if (!a || !b) {
    return +!a - +!b
  }

  const ah = a.hostname.replaceAll("__wildcard__", "*")
  const bh = b.hostname.replaceAll("__wildcard__", "*")

  // Check if one domain has more subdomains
  const aSubs = ah.split(".").filter(s => !!s).reverse()
  const bSubs = bh.split(".").filter(s => !!s).reverse()
  if (aSubs.length !== bSubs.length) {
    return bSubs.length - aSubs.length
  }

  // Check if one domain has wildcard and if so in what subdomain
  const aWildSubs = aSubs.filter(sd => sd.includes("*"))
  const bWildSubs = bSubs.filter(sd => sd.includes("*"))
  if (aWildSubs.length || bWildSubs.length) {
    // there are wildcards in hostname
    // check if one has more
    if (aWildSubs.length !== bWildSubs.length) {
      return bWildSubs.length - aWildSubs.length
    }

    // check each subdomain individually
    for (let i = 0; i < aSubs.length; i++) {
      // check if one has an earlier or more wildcards in sub
      const aSub = aSubs[i] as string
      const bSub = bSubs[i] as string
      const aSubWildCount = aSub.match(new RegExp("/*", "g"))?.length ?? 0
      const bSubWildCount = bSub.match(new RegExp("/*", "g"))?.length ?? 0
      if (aSubWildCount || bSubWildCount) {
        // This sub has wildcard(s)
        // check if one has more
        if (aSubWildCount !== bSubWildCount) {
          return bSubWildCount - aSubWildCount
        }

        // if not, longer one is more specific
        if (aSub.length !== bSub.length) {
          return bSub.length - aSub.length
        }
      }
    }
  }

  // Do the same for paths
  const ap = a.pathname.replaceAll("__wildcard__", "*")
  const bp = b.pathname.replaceAll("__wildcard__", "*")

  // Check if one path has more subpaths
  const aPaths = ap.split(".").filter(s => !!s).reverse()
  const bPaths = bp.split(".").filter(s => !!s).reverse()
  if (aPaths.length !== bPaths.length) {
    return bPaths.length - aPaths.length
  }

  // Check if one path has wildcard and if so in what subpath
  const aWildPaths = aPaths.filter(sd => sd.includes("*"))
  const bWildPaths = bPaths.filter(sd => sd.includes("*"))
  if (aWildPaths.length || bWildPaths.length) {
    // there are wildcards in hostname
    // check if one has more
    if (aWildPaths.length !== bWildPaths.length) {
      return bWildPaths.length - aWildPaths.length
    }

    // check each subdomain individually
    for (let i = 0; i < aPaths.length; i++) {
      // check if one has an earlier or more wildcards in sub
      const aPath = aPaths[i] as string
      const bPath = bPaths[i] as string
      const aPathWildCount = aPath.match(new RegExp("/*", "g"))?.length ?? 0
      const bPathWildCount = bPath.match(new RegExp("/*", "g"))?.length ?? 0
      if (aPathWildCount || bPathWildCount) {
        // This sub has wildcard(s)
        // check if one has more
        if (aPathWildCount !== bPathWildCount) {
          return bPathWildCount - aPathWildCount
        }

        // if not, longer one is more specific
        if (aPath.length !== bPath.length) {
          return bPath.length - aPath.length
        }
      }
    }
  }

  return b.href.localeCompare(a.href)
}
