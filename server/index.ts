import appConfig from './util/config'
import express, { type NextFunction, type Request, type Response } from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { provider } from './oidc/provider'
import { generateTheme } from './util/theme'
import { router } from './routes/api'
import helmet from "helmet";

const PROCESS_ROOT = path.dirname(process.argv[1] ?? ".")
const FE_ROOT = path.join(PROCESS_ROOT, '../frontend/dist/browser')

await generateTheme()

const app = express()

// MUST be hosted behind ssl terminating proxy
app.enable("trust proxy")

app.use(helmet({
  contentSecurityPolicy: {
    // use safe defaults, and also...
    useDefaults: true,
    directives: {
      "script-src": ["'self'", "'unsafe-inline'"], // angular uses inline scripts for loading
      "font-src": ["'self'", "data:"], // no external fonts
      "style-src": ["'self'", "'unsafe-inline'"], // no external styles
      "form-action": ["'self'", "https:"] // must be able to form action to external site
    },
  }
}));

app.use("/oidc", provider.callback())

app.use(express.json({ limit: "1Mb" }))
app.use(express.urlencoded({ limit: "1Mb", extended: true }))

app.use("/api", router)

// theme folder static assets
if (!fs.existsSync(appConfig.THEME_DIR)) {
  fs.mkdirSync(appConfig.THEME_DIR, {
    recursive: true
  })
}
app.use(express.static(appConfig.THEME_DIR, {
  fallthrough: true
}))

// branding folder static assets
if (!fs.existsSync(appConfig.BRANDING_DIR)) {
  fs.mkdirSync(appConfig.BRANDING_DIR, {
    recursive: true
  })
}
fs.cpSync(path.join(appConfig.THEME_DIR, 'custom.css'), path.join(appConfig.BRANDING_DIR, 'custom.css'), {
  force: false
})
app.use(express.static(appConfig.BRANDING_DIR, {
  fallthrough: true
}))

// frontend
app.use(express.static(FE_ROOT))

// Unresolved GET requests should return frontend
app.get(/(.*)/, (_req, res) => {
  res.sendFile(path.join(FE_ROOT, "./index.html"))
})

// All other unresolved are not found
app.use((req, res) => {
  res.sendStatus(404)
})

// Last chance error handler
app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  console.error(err)
  res.sendStatus(500)
})

app.listen(appConfig.PORT, () => {
  console.log(`Listening on port: ${appConfig.PORT}`)
})