import { pbkdf2, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const DIGEST_BYTES = 32
const MIN_SALT_BYTES = 8
const MIN_ITERATIONS = 10_000
const MAX_ITERATIONS = 5_000_000

const DJANGO_FORMAT = /^pbkdf2_sha256\$([1-9][0-9]*)\$([^$]+)\$([^$]+)$/
const STANDARD_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const PASSLIB_FORMAT = /^\$pbkdf2-sha256\$([1-9][0-9]*)\$([A-Za-z0-9./]+)\$([A-Za-z0-9./]+)$/

function decodeAdaptedBase64(value: string) {
  return Buffer.from(value.replaceAll('.', '+'), 'base64')
}

/**
 * Parse a PBKDF2-SHA256 hash from an external system, in Django or passlib format.
 * Used by the importer and at login, so both enforce the same limits.
 * @returns undefined for anything that is not fully valid
 */
export function parseLegacyHash(stored: string) {
  let iterationsText, salt, digest
  const django = DJANGO_FORMAT.exec(stored)
  const passlib = PASSLIB_FORMAT.exec(stored)
  if (django?.[3] && STANDARD_BASE64.test(django[3])) {
    iterationsText = django[1]
    // Django hashes the salt string as is, it is not encoded
    salt = Buffer.from(django[2] ?? '', 'utf8')
    digest = Buffer.from(django[3], 'base64')
  } else if (passlib?.[2] && passlib[3] && passlib[2].length % 4 !== 1) {
    iterationsText = passlib[1]
    salt = decodeAdaptedBase64(passlib[2])
    digest = decodeAdaptedBase64(passlib[3])
  } else {
    return undefined
  }

  const iterations = Number(iterationsText)
  if (!Number.isSafeInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS
    || salt.length < MIN_SALT_BYTES || digest.length !== DIGEST_BYTES) {
    return undefined
  }

  return { iterations, salt, digest }
}

/**
 * Never throws: a throw in basic auth would skip the failure limiter.
 */
export async function verifyLegacyHash(stored: string, password: string): Promise<boolean> {
  try {
    const parsed = parseLegacyHash(stored)
    if (!parsed) {
      return false
    }
    const derived = await promisify(pbkdf2)(password, parsed.salt, parsed.iterations, DIGEST_BYTES, 'sha256')
    return timingSafeEqual(derived, parsed.digest)
  } catch (_e) {
    return false
  }
}
