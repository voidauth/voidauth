import { Component } from '@angular/core';
import { ThemeService } from '../../services/theme.service';
import { MaterialModule } from '../../material-module';

@Component({
    selector: 'app-theme-toggle',
    imports: [MaterialModule],
    templateUrl: './theme-toggle.component.html',
    styleUrl: './theme-toggle.component.scss'
})
export class ThemeToggleComponent {
  isLightMode: boolean;

  constructor(private themeService: ThemeService) {
    this.isLightMode = this.themeService.isLightMode();
  }

  toggleTheme() {
    this.isLightMode = !this.isLightMode;
    this.themeService.setLightMode(this.isLightMode);
  }
}
