export type valueof<T extends object> = T[keyof T]

export type itemIn<T extends readonly unknown[] | unknown[]> = T[number]

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    result[key] = input[key] ?? undefined as any
  }

  return result as OptionalizedNullable<T>
}

type URLPatternGroups = {
  protocol?: string
  userinfo?: string
  hostname?: string
  port?: string
  pathname?: string
  search?: string
  hash?: string
}

export function urlFromWildcardHref(input: string) {
  const pattern = new RegExp(
    '^'
    + '(?:(?<protocol>[^:/?#]+:)(?:///?/?)?)?' // protocol, optionally match '//(/)(/)'
    + '(?:' // wrap host portions in an optional match, allows matching path/query/hash only
    + '(?:(?<userinfo>[^\\\\/?#]*)@)?' // username+password
    + '(?<hostname>[^\\\\/?#:]*?)' // hostname
    + '(?::(?<port>[0-9*]+))?' // port, ALLOW WILDCARDS, do not include ':'
    + '(?=[\\\\/?#]|$)' // match everything else up to \, /, ?, #
    + ')?'
    + '(?<pathname>[^?#:]+)?' // pathname
    + '(?:(?<search>\\?[^#]*))?' // search
    + '(?:(?<hash>#.*))?' // hash
    + '$')

  const url: URLPatternGroups | undefined = pattern.exec(input)?.groups

  // protocol and hostname are required
  // TODO: base url parameter to match URL.parse
  if (!url || !url.protocol || !url.hostname) {
    return null
  }

  return {
    protocol: url.protocol,
    hostname: url.hostname,
    pathname: url.pathname ?? '/',
    port: url.port ?? '',
    href: input,
    search: url.search ?? '',
    hash: url.hash ?? '',
    username: url.userinfo?.split(':')[0] ?? '',
    password: url.userinfo?.split(':')[1] ?? '',
  }
}

export function urlFromWildcardDomain(input: string) {
  // If the input does not start with http(s), add it so it can be later safely removed
  if (!input.startsWith('http:') && !input.startsWith('https:')) {
    input = 'http:' + input
  }

  const url = urlFromWildcardHref(input)

  if (!url) {
    return null
  }

  if (url.pathname.endsWith('/')) {
    url.pathname += '*'
  }

  return { ...url, hostname: url.hostname, pathname: url.pathname }
}

/**
 * If input is a valid redirect (supporting wildcards) returns true. Otherwise throws an error with
 * message explaining why it is not
 */
export function wildcardRedirect(input: string) {
  const uri = urlFromWildcardHref(input)

  if (!uri) {
    throw new TypeError('Invalid, must include protocol and domain.')
  }

  // redirect_uri must not include hash
  if (uri.hash) {
    throw new TypeError('Must not include fragment.')
  }

  // protocol must not include wildcard
  if (uri.protocol.includes('*')) {
    throw new TypeError('Protocol must not include wildcard.')
  }

  return uri
}

export function isValidWildcardRedirect(input: string) {
  try {
    wildcardRedirect(input)
    return true
  } catch (_e) {
    return false
  }
}

export function validateWildcardRedirects(inputs: string[]) {
  try {
    for (const input of inputs) {
      wildcardRedirect(input)
    }
  } catch (_e) {
    throw new TypeError('A Redirect URL is invalid.')
  }

  let hasHttpProtocol = false
  let hasCustomProtocol = false
  for (const input of inputs) {
    const uri = urlFromWildcardHref(input)
    if (!uri) {
      continue
    }
    const protocol = uri.protocol
    hasHttpProtocol ||= protocol === 'http:'
    hasCustomProtocol ||= (protocol !== 'http:' && protocol !== 'https:')
  }
  if (hasCustomProtocol && hasHttpProtocol) {
    throw new TypeError('Do not mix insecure and custom protocol Redirect URLs.')
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
  const url = urlFromWildcardDomain(input)
  if (!url) {
    return ''
  }
  return `${url.hostname}${url.port ? ':' + url.port : ''}${url.pathname}`
}

export function sortWildcardDomains(ad: string, bd: string) {
  const a = urlFromWildcardDomain(ad)
  const b = urlFromWildcardDomain(bd)

  if (!a || !b) {
    return +!a - +!b
  }

  // Check if one domain has more subdomains
  const ah = a.hostname
  const bh = b.hostname
  const aSubs = ah.split('.').filter(s => !!s).reverse()
  const bSubs = bh.split('.').filter(s => !!s).reverse()
  const subResult = sortWildcardParts(aSubs, bSubs)
  if (subResult) {
    return subResult
  }

  // Check if one domain has more specific port number
  const aPort = a.port != '' ? [a.port] : ['*']
  const bPort = b.port != '' ? [b.port] : ['*']
  const portResult = sortWildcardParts(aPort, bPort)
  if (portResult) {
    return portResult
  }

  // Check if one path has more subpaths
  const ap = a.pathname
  const bp = b.pathname
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
