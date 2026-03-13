import { computed, inject, Injectable, signal } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import translationsEN from '../../../public/i18n/en-US.json'
import { firstValueFrom } from 'rxjs'
import { SpinnerService } from './spinner.service'
import { SnackbarService } from './snackbar.service'

export type LangInfo = {
  value: string
  display: string
  flag: string
}

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  private translate = inject(TranslateService)
  private spinnerService = inject(SpinnerService)
  private snackbarService = inject(SnackbarService)

  public availableLangs = [
    { value: 'en-US', display: 'English', flag: '🇬🇧' },
    { value: 'de-DE', display: 'Deutsch', flag: '🇩🇪' },
    { value: 'es-ES', display: 'Español', flag: '🇲🇽' },
  ] as const satisfies LangInfo[]

  private _current = signal<string>('en-US')

  public currentLang = computed<LangInfo | null>(() => {
    return this.availableLangs.find(a => a.value === this._current()) || this.availableLangs[0]
  })

  constructor() {
    this.translate.setTranslation('en-US', translationsEN)
    this.translate.setFallbackLang('en-US')
    this.setCurrentLang(this.getInitialLang())
  }

  setCurrentLang(lang: string) {
    // Set lang on localStorage and use that lang
    this.spinnerService.show()
    firstValueFrom(this.translate.use(lang)).then(() => {
      this.setLocalStorageLang(lang)
      this._current.set(lang)
    }).catch((e: unknown) => {
      console.error(e)
      this.snackbarService.error('Cannot set language.')
    }).finally(() => {
      this.spinnerService.hide()
    })
  }

  private getInitialLang() {
    // Use localStorage lang if exists, otherwise get from current or fallback
    return this.getLocalStorageLang()
      || this.translate.getBrowserCultureLang()
      || this.translate.getBrowserLang()
      || this.translate.getCurrentLang()
      || this.translate.getFallbackLang()
      || 'en-US'
  }

  private getLocalStorageLang() {
    return localStorage.getItem('lang')
  }

  private setLocalStorageLang(lang: string) {
    localStorage.setItem('lang', lang)
  }
}
