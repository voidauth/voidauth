import { computed, inject, Injectable, signal } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import translationsEN from '../../../public/i18n/en.json'

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

  public availableLangs = [
    { value: 'en', display: 'English', flag: '🇬🇧' },
    { value: 'de', display: 'Deutsch', flag: '🇩🇪' },
    { value: 'es', display: 'Español', flag: '🇲🇽' },
  ] as const satisfies LangInfo[]

  private _current = signal<string>('en')

  public currentLang = computed<LangInfo | null>(() => {
    return this.availableLangs.find(a => a.value === this._current()) || this.availableLangs[0]
  })

  constructor() {
    this.translate.setTranslation('en', translationsEN)

    this.translate.setFallbackLang('en')

    this.setCurrentLang(this.getInitialLang())
  }

  setCurrentLang(lang: string) {
    // Set lang on localStorage and use that lang
    this.setLocalStorageLang(lang)
    this._current.set(lang)
    this.translate.use(lang)
  }

  private getInitialLang() {
    // Use localStorage lang if exists, otherwise get from current or fallback
    return this.getLocalStorageLang()
      || this.translate.getBrowserLang()
      || this.translate.getCurrentLang()
      || this.translate.getFallbackLang()
      || 'en'
  }

  private getLocalStorageLang() {
    return localStorage.getItem('lang')
  }

  private setLocalStorageLang(lang: string) {
    localStorage.setItem('lang', lang)
  }
}
