import { Component } from '@angular/core';
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

  constructor(private themeService: ThemeService) {
    this.themeMode = this.themeService.themeMode;
  }

  toggleTheme() {
    switch (this.themeMode) {
      case "system":
        this.themeService.themeMode = "dark"
        break
      case "dark":
        this.themeService.themeMode = "light"
        break
      case "light":
        this.themeService.themeMode = "dark"
        break
      default:
        this.themeService.themeMode = "dark"
    }

    this.themeMode = this.themeService.themeMode
  }
}
