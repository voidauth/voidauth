import { Component } from '@angular/core'
import { MaterialModule } from '../../material-module'

@Component({
  selector: 'app-lang-switcher',
  imports: [MaterialModule],
  templateUrl: './lang-switcher.component.html',
  styleUrl: './lang-switcher.component.scss',
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class LangSwitcherComponent {}
