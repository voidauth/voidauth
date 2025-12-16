import appConfig, { appUrl, basePath } from './util/config'
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
import initialize from 'oidc-provider/lib/helpers/initialize_keystore.js'
import { transaction, commit, rollback } from './db/db'
import { als } from './util/als'
import { sendAdminNotifications } from './util/email'
import { clearAllExpiredEntries, updateEncryptedTables } from './db/tableMaintenance'
import { createInitialAdmin } from './db/user'
import { logger } from './util/logger'
import * as psl from 'psl'

const PROCESS_ROOT = path.dirname(process.argv[1] ?? '.')
const FE_ROOT = path.join(PROCESS_ROOT, '../frontend/dist/browser')

export async function serve() {
  // Do not wait for theme to generate before starting
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

  function noCache(_req: Request, res: Response, next: NextFunction) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.setHeader('Surrogate-Control', 'no-store')

    next()
  }

  app.use(`/healthcheck`, noCache, (_req, res) => {
    res.sendStatus(200)
    return
  })

  // Check inconsistencies that cause node-oidc-provider to throw errors
  // And provide more clear errors instead
  function checkAPPUrl(req: Request, res: Response, next: NextFunction) {
    // If base hostname does not match, OIDC authorization endpoint will fail to set cookie that can persist
    if (psl.get(req.hostname) !== psl.get(appUrl().hostname)) {
      const message = 'Invalid request hostname ' + req.hostname + ', '
        + '$APP_URL hostname is ' + appUrl().hostname + ' . '
        + 'If ' + req.hostname + ' does not match what is displayed in the browser URL bar '
        + 'this may indicate a reverse-proxy misconfiguration.'
      logger.debug(message)
      res.status(400).send({
        message,
      })
      return
    }

    next()
  }

  app.use(`${basePath()}/oidc`, noCache, checkAPPUrl, provider.callback())

  app.use(express.json({ limit: '1Mb' }))

  app.use(`${basePath()}/api`, noCache, router)

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
    index: false,
    fallthrough: true,
  }))

  // theme folder static assets
  if (!fs.existsSync('./theme')) {
    fs.mkdirSync('./theme', {
      recursive: true,
    })
  }
  app.use(`${basePath()}/`, express.static('./theme', {
    index: false,
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
    fallthrough: true,
  }))

  // Unresolved GET requests should return index if they start with it basePath
  app.get(new RegExp(`(.*)`), (req, res) => {
    if (req.originalUrl.startsWith(basePath())) {
      const index = modifyIndex()
      res.send(index)
    } else {
      res.status(404).send({
        message: `Invalid subdirectory. Expected a base path of ${basePath()}/ based on APP_URL, but got ${req.protocol}://${req.host}${req.originalUrl}`,
      })
    }
  })

  // All other unresolved are not found
  app.use((_req, res) => {
    res.sendStatus(404)
  })

  // Last chance error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(err) // log here, ideally this will never be called
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
  async function doMaintenance() {
    await als.run({}, async () => {
      await transaction()
      try {
        // Remove all expired data from db
        await clearAllExpiredEntries()

        // Update encrypted table values to the current STORAGE_KEY
        await updateEncryptedTables()

        // make DB keys all valid
        await makeKeysValid()

        // ensure that initial user is properly setup
        // Create initial admin user and group
        await createInitialAdmin()

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
        logger.error(e)
      }

      // Send admin notification emails
      try {
        await sendAdminNotifications()
      } catch (e) {
        logger.error(e)
      }
    })
  }

  await doMaintenance()
  setInterval(async () => {
    // Do initial key setup and cleanup
    await doMaintenance()
  }, ((8 * 60) + randomInt(2 * 60)) * 1000)
}
