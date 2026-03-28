import { Component, inject } from '@angular/core'
import { MaterialModule } from '../../material-module'
import { TranslationService } from '../../services/translation.service'

@Component({
  selector: 'app-lang-switcher',
  imports: [MaterialModule],
  templateUrl: './lang-switcher.component.html',
  styleUrl: './lang-switcher.component.scss',
})
export class LangSwitcherComponent {
  translationService = inject(TranslationService)

  selectLang(lang: string) {
    this.translationService.setLang(lang)
  }

  // Convert a country code ("US") to its flag emoji. Will split strings that contain a dash ("en-US") and just use "US"
  getFlagEmoji(countryCode: string): string {
    if (countryCode.includes('-')) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      countryCode = countryCode.split('-')[1]! // this will definitely exist because I already checked above
    }
    if (countryCode.length !== 2) {
      return '🏳️'
    }
    // Wonky logic to convert country code to flag emoji Unicode
    // eslint-disable-next-line @typescript-eslint/no-misused-spread
    const codePoints = [...(countryCode.toUpperCase())]
      .map(char => 127397 + char.charCodeAt(0))
    const flag = String.fromCodePoint(...codePoints)
    return flag
  }
}
