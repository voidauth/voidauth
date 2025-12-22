import { argon2Sync, randomBytes, timingSafeEqual } from 'node:crypto'

function verify(hash: string, password: string): boolean {
  // Split the hash string: $[alg]$v=[version]$m=[mem],t=[iter],p=[parallel]$[salt]$[hash]
  const parts = hash.split('$')
  if (parts.length !== 6) {
    throw new Error('Invalid Argon2 PHC string format.')
  }

  const [, alg, _vStr, paramStr, saltBase64, hashBase64] = parts

  // Validate the algorithm type
  if (alg !== 'argon2d' && alg !== 'argon2i' && alg !== 'argon2id') {
    throw new Error(`Unsupported hash algorithm: ${String(alg)}`)
  }

  // Parse parameters
  const params: {
    m?: number
    t?: number
    p?: number
  } = {};

  (paramStr as string).split(',').forEach((p: string) => {
    const [k, v] = p.split('=')
    if (typeof k !== 'string' || typeof v !== 'string') {
      return
    }
    const iv = Number.parseInt(v)
    if (!Number.isInteger(iv)) {
      return
    }
    if (k !== 'm' && k !== 't' && k !== 'p') {
      return
    }
    params[k] = iv
  })

  if (!params.m || !params.t || !params.p) {
    throw new Error(`Argon2 hash missing parameters.`)
  }

  // Load salt and hash value into buffers
  const salt = Buffer.from(saltBase64 as string, 'base64')
  const storedHash = Buffer.from(hashBase64 as string, 'base64')

  // Hash password input with exact same parameters
  const passwordHashValue = argon2Sync(alg, {
    message: password,
    nonce: salt,
    parallelism: params.p,
    memory: params.m,
    passes: params.t,
    tagLength: storedHash.length,
  })

  // timingSafeEqual requires both Buffers to be the same length
  if (passwordHashValue.length !== storedHash.length) return false

  return timingSafeEqual(passwordHashValue, storedHash)
}

function hash(password: string): string {
  const options = {
    memory: 65536,
    passes: 3,
    parallelism: 4,
    tagLength: 32,
    nonce: randomBytes(16),
  }

  // create hash from password
  const hashBuffer = argon2Sync('argon2id', {
    message: password,
    ...options,
  })

  // Convert parameters to string format: m=mem,t=iter,p=parallel
  const paramsStr = `m=${String(options.memory)},t=${String(options.passes)},p=${String(options.parallelism)}`
  const saltBase64 = options.nonce.toString('base64')
  const hashBase64 = hashBuffer.toString('base64')

  // Format the full hash string
  return `$argon2id$v=19$${paramsStr}$${saltBase64}$${hashBase64}`
}

export const argon2 = {
  verify,
  hash,
}
