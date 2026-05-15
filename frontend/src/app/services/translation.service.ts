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

  private initialLangSet?: Promise<void>

  public async setInitialLang() {
    if (!this.initialLangSet) {
      this.initialLangSet = this._setInitialLang()
    }
    await this.initialLangSet
  }

  public async setLang(lang: string) {
    // Make sure the initial language is set before changing it
    if (!this.initialLangSet) {
      this.initialLangSet = this._setInitialLang()
    }
    await this.initialLangSet
    return this._setLang(lang)
  }

  private async _setLang(lang: string, autoSet = false) {
    // Set lang on localStorage and use that lang
    this.spinnerService.show()
    return new Promise<boolean>((resolve) => {
      firstValueFrom(this.translate.use(lang)).then(() => {
        if (!autoSet) {
          this.setLocalStorageLang(lang)
        }
        this._current.set(lang)
        resolve(true)
      }).catch((e: unknown) => {
        console.error(e)
        if (!autoSet) {
          this.snackbarService.error('Cannot set language.')
        }
        resolve(false)
      }).finally(() => {
        this.spinnerService.hide()
      })
    })
  }

  private async _setInitialLang() {
    const previousLang = this.getLocalStorageLang()
    if (previousLang) {
      if (await this._setLang(previousLang, true)) {
        return
      }
    }

    const browserLang = this.translate.getBrowserCultureLang()
    if (browserLang) {
      if (await this._setLang(browserLang, true)) {
        return
      }
    }

    const fallbackLang = this.translate.getFallbackLang()
    if (fallbackLang) {
      if (await this._setLang(fallbackLang, true)) {
        return
      }
    }

    await this._setLang('en-US', true)
  }

  private getLocalStorageLang() {
    return localStorage.getItem('voidauth-selected-lang')
  }

  private setLocalStorageLang(lang: string) {
    localStorage.setItem('voidauth-selected-lang', lang)
  }
}
