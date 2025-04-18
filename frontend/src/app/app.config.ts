import { type ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient, withXsrfConfiguration } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }), 
    provideRouter(routes),
    provideHttpClient(
      withXsrfConfiguration({
        cookieName: "__Host.x-csrf-token",
      })
    ),
    provideAnimationsAsync()
  ]
};

function getCookies() {
  return document.cookie.split(";").reduce((m: any, c) => {
    const [name, value] = c.split("=")
    if (name) {
      m[name]=value
    }
    return m
  }, {})
}