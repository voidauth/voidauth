export function parseDN(dn: string) {
  const input = dn.trim()

  if (!input) {
    return []
  }

  const rdns = splitUnescaped(input, ',').map(part => splitUnescaped(part, '+').map((attributeValue) => {
    const equalsIndex = findUnescaped(attributeValue, '=')

    if (equalsIndex < 1) {
      return undefined
    }

    return [
      attributeValue.slice(0, equalsIndex).trim().toLowerCase(),
      unescapeDNValue(attributeValue.slice(equalsIndex + 1).trim()).toLowerCase(),
    ] satisfies [string, string]
  }))

  if (!allNestedItemsDefined(rdns)) {
    return undefined
  }

  return rdns
}

// Test gate that no index in array is undefined
function allItemsDefined<T>(value: (T | undefined)[]): value is T[] {
  if (value.some(v => v === undefined)) {
    return false
  }
  return true
}

function allNestedItemsDefined<T>(value: (T | undefined)[][]): value is T[][] {
  if (value.some(v => !allItemsDefined(v))) {
    return false
  }
  return true
}

function splitUnescaped(input: string, separator: string) {
  const parts: string[] = []
  let current = ''
  let escaped = false

  for (const char of input) {
    if (escaped) {
      current += char
      escaped = false
    } else if (char === '\\') {
      current += char
      escaped = true
    } else if (char === separator) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }

  parts.push(current)
  return parts
}

function findUnescaped(input: string, target: string) {
  let escaped = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (escaped) {
      escaped = false
    } else if (char === '\\') {
      escaped = true
    } else if (char === target) {
      return index
    }
  }

  return -1
}

function unescapeDNValue(value: string) {
  return value.replace(/\\([0-9a-fA-F]{2}|.)/g, (_match, escaped: string) => {
    if (/^[0-9a-fA-F]{2}$/.test(escaped)) {
      return String.fromCharCode(Number.parseInt(escaped, 16))
    }

    return escaped
  })
}
