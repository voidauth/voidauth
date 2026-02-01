import { inject, Injectable } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import translationsEN from '../../../public/i18n/en.json'

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  private translate = inject(TranslateService)

  init() {
    this.translate.setTranslation('en', translationsEN)

    this.translate.setFallbackLang('en')

    this.setCurrentLang(this.getInitialLang())
  }

  setCurrentLang(lang: string) {
    // Set lang on localStorage and use that lang
    this.setLocalStorageLang(lang)
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
