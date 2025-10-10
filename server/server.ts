import appConfig, { basePath } from './util/config'
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
import { clearAllExpiredEntries, updateEncryptedTables } from './db/util'
import { transaction, commit, rollback } from './db/db'
import { als } from './util/als'
import { rateLimit } from 'express-rate-limit'
import { sendAdminNotifications } from './util/email'

const PROCESS_ROOT = path.dirname(process.argv[1] ?? '.')
const FE_ROOT = path.join(PROCESS_ROOT, '../frontend/dist/browser')

export function serve() {
  void generateTheme()

  const app = express()

  // MUST be hosted behind ssl terminating proxy
  app.enable('trust proxy')
  provider.proxy = true

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

  // apply rate limiter to all requests
  const rateWindowS = 10 * 60 // 10 minutes
  app.use(rateLimit({
    windowMs: rateWindowS * 1000,
    max: rateWindowS * 10, // max 10 requests per second
    validate: { trustProxy: false },
  }))

  app.use(`${basePath()}/oidc`, provider.callback())

  app.use(express.json({ limit: '1Mb' }))

  app.use(`${basePath()}/api`, router)

  // branding folder static assets
  if (!fs.existsSync(path.join('./config', 'branding'))) {
    fs.mkdirSync(path.join('./config', 'branding'), {
      recursive: true,
    })
  }
  fs.cpSync(path.join('./theme', 'custom.css'), path.join('./config', 'branding', 'custom.css'), {
    force: false,
  })
  // override favicon and logo requests
  app.get(/\/(logo|favicon|apple-touch-icon)\.(svg|png)/, (req, res, next) => {
    const brandingFiles = fs.readdirSync(path.join('./config', 'branding'))
    const filename = req.path.slice(1)
    if (brandingFiles.includes(filename)) {
      res.sendFile(path.join('./config', 'branding', filename), {
        root: './',
      })
      return
    }

    const isBrandingLogo = brandingFiles.includes('logo.svg') || brandingFiles.includes('logo.png')
    const isBrandingFavicon = brandingFiles.includes('favicon.svg') || brandingFiles.includes('favicon.png')
    const isBrandingTouch = brandingFiles.includes('apple-touch-icon.png')
    // custom branding exists, do not allow defaults to be used
    if (isBrandingFavicon || isBrandingLogo || isBrandingTouch) {
      res.sendStatus(404)
      return
    }

    next()
  })
  app.use(`${basePath()}/`, express.static(path.join('./config', 'branding'), {
    fallthrough: true,
  }))

  // theme folder static assets
  if (!fs.existsSync('./theme')) {
    fs.mkdirSync('./theme', {
      recursive: true,
    })
  }
  app.use(`${basePath()}/`, express.static('./theme', {
    fallthrough: true,
  }))

  // override index.html return, inject app title
  app.get(`${basePath()}/index.html`, (_req, res) => {
    const index = modifyIndex()
    res.send(index)
  })

  // frontend
  app.use(`${basePath()}/`, express.static(FE_ROOT, {
    index: false,
  }))

  // Unresolved GET requests should return index
  app.get(new RegExp(`^${basePath()}(\\/.*)?$`), (_req, res) => {
    const index = modifyIndex()
    res.send(index)
  })

  // This GET request does not match the expected subdirectory of APP_URL
  app.get(new RegExp(`(.*)`), (req, res) => {
    res.status(404).send({
      error: `Invalid subdirectory. Expected a base path of ${basePath()}/ based on APP_URL, but got ${req.protocol}://${req.host}${req.originalUrl}`,
    })
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

  app.listen(appConfig.APP_PORT, () => {
    console.log(`Listening on port: ${String(appConfig.APP_PORT)}`)
  })

  function modifyIndex() {
  // add APP_TITLE
    let index = fs.readFileSync(path.join(FE_ROOT, './index.html')).toString().replace('<title>', '<title>' + appConfig.APP_TITLE)

    // Replace base href with path of APP_URL
    index = index.replace(/<base[^>]*href=[^>]*>/g, `<base href="${basePath()}/"/>`)

    // dynamically replace favicon and logo depending on whats available in config/branding
    const brandingFiles = fs.readdirSync(path.join('./config', 'branding'))
    const isBrandingLogo = brandingFiles.includes('logo.svg') || brandingFiles.includes('logo.png')
    const isBrandingFavicon = brandingFiles.includes('favicon.svg') || brandingFiles.includes('favicon.png')
    const isBrandingTouch = brandingFiles.includes('apple-touch-icon.png')
    const isBranding = isBrandingLogo || isBrandingFavicon || isBrandingTouch

    const faviconRgx = /<link[^>]*rel="icon"[^>]*>/g
    if (!brandingFiles.includes('favicon.svg')) {
      if (brandingFiles.includes('favicon.png')) {
        index = index.replaceAll(faviconRgx, '<link rel="icon" href="favicon.png" type="image/png"/>')
      } else if (brandingFiles.includes('logo.svg')) {
        index = index.replaceAll(faviconRgx, '<link rel="icon" href="logo.svg" sizes="any" type="image/svg+xml"/>')
      } else if (brandingFiles.includes('logo.png')) {
        index = index.replaceAll(faviconRgx, '<link rel="icon" href="logo.png" type="image/png"/>')
      } else if (brandingFiles.includes('apple-touch-icon.png')) {
        index = index.replaceAll(faviconRgx, '<link rel="icon" href="apple-touch-icon.png" type="image/png"/>')
      }
    }

    if (isBranding && !isBrandingTouch) {
    // If there is branding, but no branding touch icon, remove apple-touch-icon line
      index = index.replaceAll(/<link[^>]*rel="apple-touch-icon"[^>]*>/g, '')
    }

    return index
  }

  // interval to delete expired db entries and keep keys up to date
  let previousJwks = initialJwks
  setInterval(async () => {
  // Do initial key setup and cleanup
    await als.run({}, async () => {
      await transaction()
      try {
      // Remove all expired data from db
        await clearAllExpiredEntries()

        // Update encrypted table values to the current STORAGE_KEY
        await updateEncryptedTables()

        // make DB keys all valid
        await makeKeysValid()

        // update provider cookie keys
        const cookieKeys = (await getCookieKeys()).map(k => k.value)
        if (!cookieKeys.length) {
          throw new Error('No Cookie Signing Keys found.')
        }
        if (new Set(providerCookieKeys).symmetricDifference(new Set(cookieKeys)).size) {
        // cookieKeys are not the same as providerCookieKeys
          providerCookieKeys.length = 0 // magic, deletes all entries???
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

        await commit()
      } catch (e) {
        await rollback()
        console.error(e)
      }

      // Send admin notification emails
      try {
        await sendAdminNotifications()
      } catch (e) {
        console.error(e)
      }
    })
  }, ((8 * 60) + randomInt(2 * 60)) * 1000)
}
