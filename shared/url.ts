import { stringCompare } from './utils'

type URLShape = {
  protocol: string
  username: string
  password: string
  hostname: string
  port: string
  pathname: string
  search: string
  hash: string
  href: string
}

const URLComponents = [
  'protocol',
  'username',
  'password',
  'hostname',
  'port',
  'pathname',
  'search',
  'hash',
] as const satisfies (readonly (keyof URLShape)[])

function calcHref(url: URLShape) {
  const specialProtocols = ['http:', 'https:', 'ftp:', 'ws:', 'wss:']
  const useProtoDelim = specialProtocols.includes(url.protocol) || !!url.hostname

  return url.protocol + (useProtoDelim ? '//' : '')
    + (url.username ? url.username + (url.password ? ':' + url.password : '') + '@' : '')
    + url.hostname + (url.port ? ':' + url.port : '') + url.pathname
    + url.search + url.hash
}

export function urlFromWildcardHref(input: string) {
  // escape any URLPattern special characters, except wildcards which will be replaced with regex equivalent
  // the wildcard replacement is never actually run, but it should be equivalent and non-representable after the
  // previous regex escape (it would have been escaped)
  const escaped = input.replaceAll(/([.*:+?^${}()|[\]\\])/g, '\\$1').replaceAll(/\\\*/g, () => {
    return `(.{0,})`
  })
  let parsedPattern: URLPattern
  try {
    parsedPattern = new URLPattern(escaped)
  } catch {
    return null
  }

  const url = Object.fromEntries(
    URLComponents.map((comp) => {
      const defaultValue = comp === 'pathname' ? '/' : ''
      let compValue = parsedPattern[comp]
      if (compValue === '*') {
        compValue = defaultValue
      }
      compValue = compValue.replaceAll('(.{0,})', '*')
      if (comp === 'pathname') {
        compValue = compValue.replaceAll('\\\\', '/')
      }
      compValue = compValue.replaceAll('\\', '')
      return [comp, compValue]
    }),
  ) as URLShape

  const result = {
    protocol: url.protocol + ':',
    hostname: url.hostname,
    username: url.username,
    password: url.password,
    port: url.port,
    pathname: url.pathname,
    search: url.search ? '?' + url.search : '',
    hash: url.hash ? '#' + url.hash : '',
    href: input,
  }

  result.href = calcHref(result)

  return result satisfies URLShape
}

export function urlFromWildcardDomain(input: string) {
  // input should not include a protocol
  // If the input does not start with http(s), add it so it can be later safely removed
  if (!input.startsWith('http:') && !input.startsWith('https:')) {
    input = 'http:' + input
  }

  const url = urlFromWildcardHref(input)

  if (!url || !url.hostname) {
    return null
  }

  if (url.pathname.endsWith('/')) {
    url.pathname += '*'
  }

  url.protocol = ''
  url.href = calcHref(url)

  return url
}

// Compare each component of the URL, allowing wildcards in the pattern
function matchComponent(patternComp?: string, candidateComp?: string, caseSensitive = true) {
  if (patternComp == null || candidateComp == null) {
    return patternComp === candidateComp
  }

  if (!caseSensitive) {
    patternComp = patternComp.toLowerCase()
    candidateComp = candidateComp.toLowerCase()
  }
  if (patternComp.includes('*')) {
    // use the new regex escape api
    const regex = new RegExp('^' + patternComp.split('*').map(s => RegExp.escape(s)).join('.*') + '$')
    return regex.test(candidateComp)
  }
  return patternComp === candidateComp
}

export function hrefIsWildcardMatch(pattern: string, candidate: string) {
  if (!candidate) {
    return false
  }

  const patternUrl = urlFromWildcardHref(pattern)
  const candidateUrl = urlFromWildcardHref(candidate)
  if (!patternUrl || !candidateUrl) {
    return false
  }

  return (
    matchComponent(patternUrl.protocol, candidateUrl.protocol, false)
    && matchComponent(patternUrl.username, candidateUrl.username)
    && matchComponent(patternUrl.password, candidateUrl.password)
    && matchComponent(patternUrl.hostname, candidateUrl.hostname, false)
    && matchComponent(patternUrl.port, candidateUrl.port)
    && matchComponent(patternUrl.pathname, candidateUrl.pathname)
    && matchComponent(patternUrl.search, candidateUrl.search)
    && matchComponent(patternUrl.hash, candidateUrl.hash)
  )
}

export function domainIsWildcardMatch(pattern: string, candidate: string) {
  const patternUrl = urlFromWildcardDomain(pattern)
  const candidateUrl = urlFromWildcardDomain(candidate)
  if (!patternUrl || !candidateUrl) {
    return false
  }

  // If the pattern URL does not specify a port, treat it as a wildcard
  if (!patternUrl.port) {
    patternUrl.port = '*'
  }

  return (
    matchComponent(patternUrl.hostname, candidateUrl.hostname, false)
    && matchComponent(patternUrl.port, candidateUrl.port)
    && matchComponent(patternUrl.pathname, candidateUrl.pathname)
  )
}

/**
 * If input is a valid redirect (supporting wildcards) returns true. Otherwise throws an error with
 * message explaining why it is not
 */
export function wildcardRedirect(input: string) {
  const uri = urlFromWildcardHref(input)

  if (!uri) {
    throw new TypeError('Invalid.')
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
  } catch (e) {
    throw new TypeError('A Redirect URL is invalid.', { cause: e })
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
    throw new TypeError('Cannot mix insecure and custom protocol Redirect URLs.')
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
  return `${url.hostname}${url.port ? (':' + url.port) : ''}${url.pathname}`
}

export function sortWildcardDomains(ad: string, bd: string) {
  const a = urlFromWildcardDomain(ad)
  const b = urlFromWildcardDomain(bd)

  if (!a || !b) {
    return +!a - +!b
  }

  const sortWildcardParts = (aParts: string[], bParts: string[]) => {
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
      const partWildRegex = new RegExp('\\*', 'g')
      for (let i = 0; i < aParts.length; i++) {
        // check if one has an earlier wildcard part
        // or more wildcards in a part
        const aPart = aParts[i] as string
        const bPart = bParts[i] as string
        const aPartWildCount = aPart.match(partWildRegex)?.length ?? 0
        const bPartWildCount = bPart.match(partWildRegex)?.length ?? 0
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

  // Check if one domain has more subdomains
  const ah = a.hostname
  const bh = b.hostname
  const aSubs = ah.split('.').filter(Boolean).reverse()
  const bSubs = bh.split('.').filter(Boolean).reverse()
  const subResult = sortWildcardParts(aSubs, bSubs)
  if (subResult) {
    return subResult
  }

  // Check if one domain has more specific port number
  const aPort = a.port !== '' ? [a.port] : ['*']
  const bPort = b.port !== '' ? [b.port] : ['*']
  const portResult = sortWildcardParts(aPort, bPort)
  if (portResult) {
    return portResult
  }

  // Check if one path has more subpaths
  const ap = a.pathname
  const bp = b.pathname
  const aPaths = ap.split('/').filter(Boolean)
  const bPaths = bp.split('/').filter(Boolean)
  const pathResult = sortWildcardParts(aPaths, bPaths)
  if (pathResult) {
    return pathResult
  }

  return stringCompare(b.href, a.href)
}
