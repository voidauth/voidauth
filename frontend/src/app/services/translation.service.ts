import { computed, inject, Injectable, signal } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import locales from '../../../public/locales.json'
import { firstValueFrom } from 'rxjs'
import { SpinnerService } from './spinner.service'
import { SnackbarService } from './snackbar.service'

export type LangInfo = {
  code: string
  display: string
}

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  private translate = inject(TranslateService)
  private spinnerService = inject(SpinnerService)
  private snackbarService = inject(SnackbarService)

  private _current = signal<string>('en-US')

  public availableLangs = locales.sort((a, b) => a.display.localeCompare(b.display))

  public currentLang = computed<LangInfo | null>(() => {
    return this.availableLangs.find(a => a.code === this._current()) || null
  })

  constructor() {
    this.setLang(this.getInitialLang(), true)
  }

  setLang(lang: string, autoSet = false) {
    // Set lang on localStorage and use that lang
    this.spinnerService.show()
    firstValueFrom(this.translate.use(lang)).then(() => {
      this.setLocalStorageLang(lang)
      this._current.set(lang)
    }).catch((e: unknown) => {
      console.error(e)
      if (!autoSet) {
        this.snackbarService.error('Cannot set language.')
      }
    }).finally(() => {
      this.spinnerService.hide()
    })
  }

  private getInitialLang() {
    // Use localStorage lang if exists, otherwise get from current or fallback
    return this.getLocalStorageLang()
      || this.translate.getBrowserCultureLang()
      || this.translate.getCurrentLang()
      || this.translate.getFallbackLang()
      || 'en-US'
  }

  private getLocalStorageLang() {
    return localStorage.getItem('voidauth-lang')
  }

  private setLocalStorageLang(lang: string) {
    localStorage.setItem('voidauth-lang', lang)
  }
}
