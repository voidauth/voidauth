import assert from 'node:assert/strict'
import { pbkdf2Sync } from 'node:crypto'
import { test } from 'node:test'
import { parseLegacyHash, verifyLegacyHash } from './legacyHash'

const DJANGO_ASCII = 'pbkdf2_sha256$1000000$zJ7e2XE2M2P0FhVAs3tQSb$17l0/VWbhlQgRO3CseqlMwRIk8TtatDkbA1g0Galp70='
const PASSLIB_ASCII = '$pbkdf2-sha256$29000$EqKU8r7Xei/lfC9FyNk7hw$eRKrQJgclKKtyylC8J4Ox34R097ZpMoU/QC0heA5y.w'
const DJANGO_DIGEST = 'uO77hHgpYNI4eG6pbRKV2uEKTpFNTen+5J+Wg2Ait9M='
const PASSLIB_DIGEST = 'zdXZuqHurqISL4zzfy/NY.28a/XIPnCz1I/1hrFeOXE'

const NFD_PASSWORD = 'Pässwörd'
const DJANGO_NFD = 'pbkdf2_sha256$1000000$qyTakcMRi282KOmqNkg1lq$EqxW3sBvAkeEHrcvMurTp9eHhRDheLamGBASvhZefqM='
const PASSLIB_NFD = '$pbkdf2-sha256$29000$SokRIqQ0hnAOoZTS2tsbQw$7ve7DNE8/4fFSZZacZeDVKJAiifHWwPixZnhmfQ1vnA'

// Generated with real Django 5.2.19 and passlib 1.7.4, not this code
const ACCEPTED: [string, string][] = [
  ['correct horse battery staple', DJANGO_ASCII],
  ['correct horse battery staple', PASSLIB_ASCII],
  ['pass:word:with:colons', 'pbkdf2_sha256$1000000$kLsQDzIQcFkKpTjSr23CZj$Od/jYFaSJe09bC4Lpa4P89KAOAw/1TJfHafA+ksWgNg='],
  ['pass:word:with:colons', '$pbkdf2-sha256$29000$.f//H2MMQUjp3dtba83ZWw$h11fH5pZ89HbH9HSKG2dAG.mzy.yLXhc4MQgd7Uoj64'],
  ['Pässwörd-ñ-日本語-🔑', 'pbkdf2_sha256$1000000$ptdicLJlSvK90UXWeMV2S6$8rHU2VivKjo85BQPq8EJCLPnfzdF0ESy1rGFu3TI9h0='],
  ['Pässwörd-ñ-日本語-🔑', '$pbkdf2-sha256$29000$xfg/pzSm1Lp3LoWwVqoVwg$5DITWUcggyLCwUJlYRgD2Lgin8LY67sKiTproexYGY0'],
  [NFD_PASSWORD, DJANGO_NFD],
  [NFD_PASSWORD, PASSLIB_NFD],
  ['  leading and trailing  ', 'pbkdf2_sha256$1000000$Bf8rrr60PFtXTNcAILMsri$NXeJu1ltXOM9LRrsx3hf6KgpQK8u3RSMpIHaJ3GQfQQ='],
  ['  leading and trailing  ', '$pbkdf2-sha256$29000$FcJ4z1krRShlDAEA4PyfUw$cSrNGIcuxD4mLnbBYxs10sU70aDf0ZyKom1EdwNP4sU'],
  ['x'.repeat(200), 'pbkdf2_sha256$1000000$a6bluKSO9zvmAYoOjIXmNw$DtRm4U6rNT7ufMAznnsNNGDC6e7eHBbZjYD1loFQsa0='],
  ['x'.repeat(200), '$pbkdf2-sha256$29000$oNR6by3lHKNUau291xojBA$sIVL56h3NT9m84Ox4qMFRPdPkNMIiiIy2gtslSysTQo'],
  ['dol$lar$pass', 'pbkdf2_sha256$1000000$PYHKX8Z0ZHoKMWGjMrad3r$u5nbUWhADQ2pnx/jfQLHdTwMIDHsz823uzIk7OeycN8='],
  ['dol$lar$pass', '$pbkdf2-sha256$29000$pTRmDMFYq3UuRShlzLmXEg$eetEoJE6dzcWSNuTn0a4s7qToLnxhVmdEmlV62mvIOw'],
  ['fixture-pass-1', `pbkdf2_sha256$10000$abcdefghijkl$${DJANGO_DIGEST}`],
  ['fixture-pass-1', `$pbkdf2-sha256$10000$h1AKIURIiVFqzZnTmvN.Dw$${PASSLIB_DIGEST}`],
  ['fixture-pass-2', '$pbkdf2-sha256$10000$.//..//..//..//..//..//.$DDLziFx8eMuVd/cmRxcZsRbh3KbSLDmmGo7QZEmhJzQ'],
]

const REFUSED = [
  // Real values from Django and passlib
  '!Gu8PoQqbQVRpWx7ZQcEOMgJ4U9gGty7OALnUZpyS',
  '$pbkdf2$131000$0RojREjJufd.7z1nTKn1/g$bJMV8gL/vyh/iYg1vRZfFhd83Z4',
  '$pbkdf2-sha512$25000$FqJ0znlvDUFoLWUMAcB4Tw$f7i8ZhFQU1rdXQlXusTwVbwPFtjak20V42n2/GUEozuYPMGby9tRm5hVIwyFOdmB/c0Urq0UjBxjA1/97kW6aA',
  '',
  'pbkdf2_sha256$10000$abcdefghijkl$',
  `pbkdf2_sha256$10000$$${DJANGO_DIGEST}`,
  `$pbkdf2-sha256$10000$$${PASSLIB_DIGEST}`,
  'pbkdf2_sha256$10000$abcdefghijkl$uO77',
  ...['1000abc', '010000', '9999', '5000001', '99999999999999999999'].flatMap(iterations => [
    `pbkdf2_sha256$${iterations}$abcdefghijkl$${DJANGO_DIGEST}`,
    `$pbkdf2-sha256$${iterations}$h1AKIURIiVFqzZnTmvN.Dw$${PASSLIB_DIGEST}`,
  ]),
  `pbkdf2_sha256$10000$abcdefghijkl$!!!${DJANGO_DIGEST.slice(3)}`,
  `pbkdf2_sha256$10000$abcdefghijkl$${DJANGO_DIGEST.slice(0, -1)}`,
  `$pbkdf2-sha256$10000$h1AKIURIiVFqzZnTmvN.Dw$${PASSLIB_DIGEST}=`,
  `$pbkdf2-sha256$10000$h1AKIURIi+FqzZnTmvN.Dw$${PASSLIB_DIGEST}`,
  // A salt that is not a valid base64 length
  `$pbkdf2-sha256$10000$abcdefghi$${PASSLIB_DIGEST}`,
  `pbkdf2_sha256$10000$abcdefghijkl$${DJANGO_DIGEST.replace('+', '-')}`,
  `pbkdf2_sha256$10000$abcdefghijkl$${DJANGO_DIGEST.replace('+', '_')}`,
  `pbkdf2_sha256$10000$abc$${DJANGO_DIGEST}`,
  `pbkdf2_sha256$10000$abcdefghijkl$${DJANGO_DIGEST}$extra`,
  `pbkdf2_sha1$10000$abcdefghijkl$${DJANGO_DIGEST}`,
  'bcrypt_sha256$$2b$12$aaaa',
  'md5$a$b',
  `pbkdf2_sha256$10000$abcdefghijkl$${DJANGO_DIGEST}\n`,
  ` pbkdf2_sha256$10000$abcdefghijkl$${DJANGO_DIGEST}`,
  `$pbkdf2-sha256$10000$h1AKIURIiVFqzZnTmvN.Dw$${PASSLIB_DIGEST}\n`,
]

function derive(password: string, salt: string, iterations: number) {
  return pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64')
}

for (const [password, hash] of ACCEPTED) {
  void test(`accepts ${hash.slice(0, 40)}`, async () => {
    assert.equal(await verifyLegacyHash(hash, password), true)
    assert.equal(await verifyLegacyHash(hash, `${password}x`), false)
  })
}

void test('never normalises a password', async () => {
  assert.notEqual(NFD_PASSWORD, NFD_PASSWORD.normalize('NFC'))
  assert.equal(await verifyLegacyHash(DJANGO_NFD, NFD_PASSWORD.normalize('NFC')), false)
  assert.equal(await verifyLegacyHash(PASSLIB_NFD, NFD_PASSWORD.normalize('NFC')), false)
})

for (const hash of REFUSED) {
  void test(`refuses ${JSON.stringify(hash.slice(0, 60))}`, async () => {
    assert.equal(parseLegacyHash(hash), undefined)
    assert.equal(await verifyLegacyHash(hash, 'fixture-pass-1'), false)
  })
}

void test('accepts the limits exactly', async () => {
  const minimum = `pbkdf2_sha256$10000$abcdefgh$${derive('pw', 'abcdefgh', 10_000)}`
  assert.equal(await verifyLegacyHash(minimum, 'pw'), true)

  const maximum = `pbkdf2_sha256$5000000$abcdefgh$${derive('pw', 'abcdefgh', 5_000_000)}`
  assert.equal(await verifyLegacyHash(maximum, 'pw'), true)

  assert.equal(parseLegacyHash(`pbkdf2_sha256$10000$abcdefg$${derive('pw', 'abcdefg', 10_000)}`), undefined)
  // 11 adapted base64 characters decode to exactly 8 bytes
  assert.equal(parseLegacyHash(`$pbkdf2-sha256$10000$abcdefghijk$${PASSLIB_DIGEST}`)?.salt.length, 8)
  assert.equal(parseLegacyHash(`$pbkdf2-sha256$10000$abcdefghij$${PASSLIB_DIGEST}`), undefined)
})

void test('does not throw on values that are not strings', async () => {
  assert.equal(await verifyLegacyHash(null as unknown as string, 'pw'), false)
  assert.equal(await verifyLegacyHash(DJANGO_ASCII, null as unknown as string), false)
})
