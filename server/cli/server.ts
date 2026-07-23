import appConfig, { basePath, getSessionDomain, sessionDomainReaches } from '../util/config'
import * as _types_valid from '../@types/type_validator'
import express, { type NextFunction, type Request, type Response } from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { initialJwks, provider, providerCookieKeys } from '../oidc/provider'
import { generateTheme } from '../util/theme'
import { getUserSessionInteraction, router } from '../routes/api'
import helmet from 'helmet'
import { getCookieKeys, getJWKs, makeKeysValid } from '../db/key'
import { randomInt } from 'node:crypto'
import initialize from 'oidc-provider/lib/helpers/initialize_keystore.js'
import { transaction, commit, rollback } from '../db/db'
import { als } from '../util/als'
import { sendAdminNotifications } from '../util/email'
import { clearAllExpiredEntries, updateEncryptedTables } from '../db/tableMaintenance'
import { createInitialAdmin } from '../db/user'
import { logger, purgeAsyncLog } from '../util/logger'
import { sensitiveRateLimit, standardRateLimit } from '../util/rateLimit'
import { FORBIDDEN_PATHS, NOT_FOUND_PATHS } from '@shared/constants'
import { startLDAPServer } from '../ldap/server'

const PROCESS_ROOT = path.dirname(process.argv[1] ?? '.')
const FE_ROOT = path.join(PROCESS_ROOT, '../frontend/dist/browser')

export async function serve() {
  // Do not wait for theme to generate before starting
  void generateTheme()
  if (appConfig.LDAP_ENABLED) {
    startLDAPServer()
  }

  const app = express()

  app.set('trust proxy', appConfig.TRUSTED_PROXIES)
  provider.proxy = true

  app.use(helmet({
    crossOriginOpenerPolicy: false,
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
  app.use(standardRateLimit)

  // use sensitiveRateLimit on all post-put-patch-delete requests
  app.post(new RegExp(`(.*)`), sensitiveRateLimit)
  app.put(new RegExp(`(.*)`), sensitiveRateLimit)
  app.patch(new RegExp(`(.*)`), sensitiveRateLimit)
  app.delete(new RegExp(`(.*)`), sensitiveRateLimit)

  function noCache(_req: Request, res: Response, next: NextFunction) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.setHeader('Surrogate-Control', 'no-store')

    next()
  }

  app.use(`/healthcheck`, noCache, (_req, res) => {
    res.status(200).send()
    return
  })

  // Check inconsistencies that cause node-oidc-provider to throw errors
  // And provide more clear errors instead
  function checkAPPUrl(req: Request, _res: Response, next: NextFunction) {
    // If base hostname does not match, OIDC authorization endpoint will fail to set cookie that can persist
    // Do not throw a hard error here, hostname might be getting mangled on the way in but still correct in browser
    if (!sessionDomainReaches(req.hostname)) {
      const message = 'Invalid request hostname \'' + req.hostname + '\', '
        + 'Session Domain is \'' + String(getSessionDomain()) + '\'. '
        + 'If \'' + req.hostname + '\' does not match what is displayed in the browser URL bar '
        + 'this may indicate a reverse-proxy misconfiguration.'
      logger({
        level: 'debug',
        message: message,
      })
    }

    next()
  }

  function setAsyncLocalStorage(req: Request, res: Response, next: NextFunction) {
    als.run({}, () => {
      logger({
        level: 'debug',
        message: 'API Request Started',
        request: {
          ip: req.ip,
          method: req.method,
          // show only original path without query to avoid logging sensitive info
          path: req.baseUrl + req.path,
        },
      })
      res.on('finish', async () => {
        try {
          // finalize the log with the res details
          logger({
            level: 'debug',
            message: 'API Response Sent',
            response: {
              statusCode: res.statusCode,
              location: res.getHeader('Location') ? String(res.getHeader('Location')) : undefined,
            },
          })

          // commit or rollback transaction based on res statusCode
          if (res.statusCode >= 500 && res.statusCode < 600) {
            await rollback()
          } else {
            await commit()
          }
        } catch (error) {
          logger({
            level: 'error',
            message: 'Error occurred during transaction commit/rollback',
            errors: error instanceof Error ? [error] : [{ message: String(error) }],
          })
        } finally {
          purgeAsyncLog()
        }
      })
      next()
    })
  }

  app.use(`${basePath()}/oidc`, noCache, checkAPPUrl, setAsyncLocalStorage, async (req, res, next) => {
    try {
      const user = await getUserSessionInteraction(req, res)

      if (user) {
        req.user = user
      }
    } catch (_e) {
      // do nothing
    }
    next()
  }, provider.callback())

  app.use(express.json({ limit: '1Mb' }))

  app.use(`${basePath()}/api`, noCache, setAsyncLocalStorage, router)

  // branding folder static assets
  if (!fs.existsSync(path.join('./config', 'branding'))) {
    fs.mkdirSync(path.join('./config', 'branding'), {
      recursive: true,
    })
  }
  fs.cpSync(path.join('./theme', 'custom.css'), path.join('./config', 'branding', 'custom.css'), {
    force: false,
  })
  // certain static assets should have Cross-Origin-Resource-Policy = cross-origin header
  const brandImgRegex = new RegExp(`(logo|favicon|apple-touch-icon)\\.(svg|png|jpg|jpeg)`)
  const brandImgPathRegex = new RegExp(`^${basePath()}/${brandImgRegex.source}$`)
  app.use(brandImgPathRegex, (_req, res, next) => {
    // Allow branding assets to be used cross-origin
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    next()
  })
  app.use(`${basePath()}/`, express.static(path.join('./config', 'branding'), {
    index: false,
  }))
  // override favicon and logo requests
  // do not return VoidAuth branding if custom branding exists
  app.get(brandImgPathRegex, (_req, res, next) => {
    const brandingFiles = fs.readdirSync(path.join('./config', 'branding'))
    // if custom branding exists, do not allow defaults to be used
    if (brandingFiles.some(f => brandImgRegex.test(f))) {
      res.sendStatus(404)
      return
    }
    next()
  })

  // theme folder static assets
  if (!fs.existsSync('./theme')) {
    fs.mkdirSync('./theme', {
      recursive: true,
    })
  }
  app.use(`${basePath()}/`, express.static('./theme', {
    index: false,
  }))

  // Do not fallthrough to index.html for missing i18n files
  app.use(`${basePath()}/i18n`, express.static(path.join(FE_ROOT, 'i18n'), {
    index: false,
  }), (_req, res, _next) => {
    res.status(404).send({
      message: 'Translation file not found.',
    })
  })

  // override index.html return, inject app title
  app.get(`${basePath()}/index.html`, (_req, res) => {
    const index = modifyIndex()
    res.send(index)
  })

  // generic frontend
  app.use(`${basePath()}/`,
    // if frontend matches specific paths, use different status codes
    (req, res, next) => {
      if (FORBIDDEN_PATHS.some(p => req.path === `/${p}`)) {
        res.status(403)
      } else if (NOT_FOUND_PATHS.some(p => req.path === `/${p}`)) {
        res.status(404)
      }
      next()
    },
    express.static(FE_ROOT, {
      index: false,
    }),
  )

  // Unresolved GET requests should return index if they start with basePath
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      next()
      return
    } else if (req.originalUrl.startsWith(basePath() + '/') || req.originalUrl === basePath()) {
      // req.originalUrl starts with basePath + / or is exactly basePath
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
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger({
      level: 'error',
      message: 'Unhandled API error',
      errors: err instanceof Error ? [err] : [{ message: String(err) }],
    })
    if (!res.statusCode || res.statusCode === 200) {
      const errStatus = err && typeof err === 'object' && 'status' in err && typeof err.status === 'number' ? err.status : 500
      res.status(errStatus)
    }
    if (res.headersSent) {
      return
    }
    res.sendStatus(res.statusCode)
  })

  app.listen(appConfig.APP_PORT, () => {
    logger({
      level: 'info',
      message: `API and GUI listening on ${typeof appConfig.APP_PORT === 'number' ? 'port' : 'socket'}: ${String(appConfig.APP_PORT)}`,
    })
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
    const isBrandingImgs = isBrandingLogo || isBrandingFavicon || isBrandingTouch

    // find a file to use as the favicon
    const faviconRegex = /<link[^>]*rel="icon"[^>]*>/g
    if (isBrandingImgs) {
      const brandingFiles = fs.readdirSync(path.join('./config', 'branding'))
      const faviconPreferenceOrder = ['favicon.svg', 'favicon.png', 'logo.svg', 'logo.png', 'apple-touch-icon.png']
      const firstFaviconFile = faviconPreferenceOrder.find(file => brandingFiles.includes(file))

      if (firstFaviconFile) {
        const extraAttrs = firstFaviconFile.endsWith('.svg') ? 'sizes="any" type="image/svg+xml"' : 'type="image/png"'
        index = index.replaceAll(faviconRegex, `<link rel="icon" href="${firstFaviconFile}" ${extraAttrs}/>`)
      }

      // Get which file to use for logo
      const logoPreferenceOrder = ['logo.svg', 'logo.png', 'favicon.svg', 'favicon.png', 'apple-touch-icon.png']
      const firstLogoFile = logoPreferenceOrder.find(file => brandingFiles.includes(file))
      // if there is a logo file, replace the default logo meta with it
      if (firstLogoFile) {
        index = index.replace(/<meta[^>]*name="logoUri"[^>]*>/g, `<meta name="logoUri" content="${firstLogoFile}"/>`)
      }
    }

    if (isBrandingImgs && !isBrandingTouch) {
      // If there is branding, but no branding touch icon, remove apple-touch-icon line
      index = index.replaceAll(/<link[^>]*rel="apple-touch-icon"[^>]*>/g, '')
    }

    return index
  }

  // interval to delete expired db entries and keep keys up to date
  let previousJwks = initialJwks
  async function doMaintenance(initialRun: boolean = false) {
    await als.run({}, async () => {
      await transaction()
      try {
        // Remove all expired data from db
        await clearAllExpiredEntries()

        // Update encrypted table values to the current STORAGE_KEY
        await updateEncryptedTables(initialRun)

        // make DB keys all valid
        await makeKeysValid()

        // ensure that initial user is properly setup
        // Create initial admin user and group
        if (initialRun) {
          await createInitialAdmin()
        }

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
        logger({
          level: 'error',
          message: 'Error occurred during table maintenance',
          errors: e instanceof Error ? [e] : [{ message: String(e) }],
        })
      } finally {
        purgeAsyncLog()
      }

      // Send admin notification emails
      try {
        await sendAdminNotifications()
      } catch (e) {
        logger({
          level: 'error',
          message: 'Error occurred while sending admin notifications',
          errors: e instanceof Error ? [e] : [{ message: String(e) }],
        })
      } finally {
        purgeAsyncLog()
      }
    })
  }

  await doMaintenance(true)
  setInterval(async () => {
    // Do initial key setup and cleanup
    await doMaintenance()
  }, ((8 * 60) + randomInt(2 * 60)) * 1000)
}
