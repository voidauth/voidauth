import { type ApplicationConfig, provideZoneChangeDetection } from '@angular/core'
import { provideRouter } from '@angular/router'
import { routes } from './app.routes'
import { provideHttpClient, withInterceptors, type HttpInterceptorFn } from '@angular/common/http'
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async'
import { getBaseHrefPath } from './services/config.service'
import { OVERLAY_DEFAULT_CONFIG, type OverlayDefaultConfig } from '@angular/cdk/overlay'

const baseHrefInterceptor: HttpInterceptorFn = (req, next) => {
  // Skip external URLs
  if (req.url.startsWith('http://') || req.url.startsWith('https://')) {
    return next(req)
  }

  // Clone and modify request
  const modifiedReq = req.clone({
    url: `${getBaseHrefPath()}${req.url}`,
  })

  // Proceed with modified request
  return next(modifiedReq)
}

// avoid using popover for overlays, rely on z-index instead.
// prevents issue with ngx-spinner being behind dialogs
const overlayDefaultConfig: OverlayDefaultConfig = {
  usePopover: false,
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([baseHrefInterceptor]),
    ),
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    provideAnimationsAsync(),
    { provide: OVERLAY_DEFAULT_CONFIG, useValue: overlayDefaultConfig },
  ],
}
