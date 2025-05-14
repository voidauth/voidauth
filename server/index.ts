import appConfig from './util/config'
import * as _ from '../custom_typings/type_validator'
import express, { type NextFunction, type Request, type Response } from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { initialJwks, provider, providerCookieKeys } from './oidc/provider'
import { generateTheme } from './util/theme'
import { router } from './routes/api'
import helmet from 'helmet'
import { getCookieKeys, getJWKs, makeKeysValid } from './db/key'
import { randomInt } from 'node:crypto'
import initialize from 'oidc-provider/lib/helpers/initialize_keystore'

const PROCESS_ROOT = path.dirname(process.argv[1] ?? '.')
const FE_ROOT = path.join(PROCESS_ROOT, '../frontend/dist/browser')
const APP_URL = URL.parse(appConfig.APP_DOMAIN)
const PORT = APP_URL?.port || (APP_URL?.protocol === 'https' ? '443' : '80')

void generateTheme()

const app = express()

// MUST be hosted behind ssl terminating proxy
app.enable('trust proxy')

app.use(helmet({
  contentSecurityPolicy: {
    // use safe defaults, and also...
    useDefaults: true,
    directives: {
      'script-src': ['\'self\'', '\'unsafe-inline\''], // angular uses inline scripts for loading
      'img-src': ['\'self\'', 'data:', 'https:'], // needed to load client logoUri
      'font-src': ['\'self\'', 'data:'], // no external fonts
      'style-src': ['\'self\'', '\'unsafe-inline\''], // no external styles
      'form-action': ['\'self\'', 'https:'], // must be able to form action to external site
    },
  },
}))

app.use('/oidc', provider.callback())

app.use(express.json({ limit: '1Mb' }))
app.use(express.urlencoded({ limit: '1Mb', extended: true }))

app.use('/api', router)

// theme folder static assets
if (!fs.existsSync('./theme')) {
  fs.mkdirSync('./theme', {
    recursive: true,
  })
}
app.use(express.static('./theme', {
  fallthrough: true,
}))

// branding folder static assets
if (!fs.existsSync(path.join('./config', 'branding'))) {
  fs.mkdirSync(path.join('./config', 'branding'), {
    recursive: true,
  })
}
fs.cpSync(path.join('./theme', 'custom.css'), path.join('./config', 'branding', 'custom.css'), {
  force: false,
})
app.use(express.static(path.join('./config', 'branding'), {
  fallthrough: true,
}))

// override index.html return, inject app title
app.get('/index.html', (_req, res) => {
  const index = fs.readFileSync(path.join(FE_ROOT, './index.html'))
    .toString().replace('<title>', '<title>' + appConfig.APP_TITLE)
  res.send(index)
})

// frontend
app.use(express.static(FE_ROOT, {
  index: false,
}))

// Unresolved GET requests should return frontend
app.get(/(.*)/, (_req, res) => {
  const index = fs.readFileSync(path.join(FE_ROOT, './index.html'))
    .toString().replace('<title>', '<title>' + appConfig.APP_TITLE)
  res.send(index)
})

// All other unresolved are not found
app.use((_req, res) => {
  res.sendStatus(404)
})

// Last chance error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.sendStatus(500)
})

app.listen(PORT, () => {
  console.log(`Listening on port: ${PORT}`)
})

// interval to keep keys up to date every 10 minutes +- 1 minute
let previousJwks = initialJwks
setInterval(async () => {
  // make DB keys all valid
  await makeKeysValid()

  // update provider cookie keys
  const cookieKeys = (await getCookieKeys()).map(k => k.value)
  if (!cookieKeys.length) {
    throw new Error('No Cookie Signing Keys found.')
  }
  if (new Set(providerCookieKeys).symmetricDifference(new Set(cookieKeys)).size) {
    // cookieKeys are not the same as providerCookieKeys
    providerCookieKeys.length = 0 // magic, deletes all entries
    providerCookieKeys.unshift(...cookieKeys) // adds all db cookie keys
  }

  // update provider jwks
  const jwks = { keys: (await getJWKs()).map(k => k.jwk) }
  if (!jwks.keys.length) {
    throw new Error('No OIDC JWKs found.')
  }
  if (new Set(previousJwks.keys.map(j => j.kid)).symmetricDifference(new Set(jwks.keys.map(j => j.kid))).size) {
    // db jwks have changed
    initialize.call(provider, jwks)
    previousJwks = jwks
  }
}, ((9 * 60) + randomInt(2 * 60)) * 1000)
