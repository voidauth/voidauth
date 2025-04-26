import { Component, inject } from '@angular/core';
import { ThemeService, type ThemeMode } from '../../services/theme.service';
import { MaterialModule } from '../../material-module';

@Component({
    selector: 'app-theme-toggle',
    imports: [MaterialModule],
    templateUrl: './theme-toggle.component.html',
    styleUrl: './theme-toggle.component.scss'
})
export class ThemeToggleComponent {
  public themeMode: ThemeMode = "system";

  themeService = inject(ThemeService)

  constructor() {
    this.themeMode = this.themeService.themeMode;
  }

  setTheme(mode: ThemeMode) {
    this.themeService.themeMode = mode
    this.themeMode = mode
  }
}
