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
    this.translationService.setCurrentLang(lang)
  }
}
