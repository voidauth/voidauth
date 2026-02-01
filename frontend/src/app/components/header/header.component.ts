import { Component, inject, output, type OnInit } from '@angular/core'
import { RouterLink } from '@angular/router'
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component'
import { MaterialModule } from '../../material-module'
import { UserService } from '../../services/user.service'
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'
import { ConfigService } from '../../services/config.service'
import { SpinnerService } from '../../services/spinner.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { LogoComponent } from './logo.component'
import { LangSwitcherComponent } from '../lang-switcher/lang-switcher.component'

@Component({
  selector: 'app-header',
  imports: [
    MaterialModule,
    ThemeToggleComponent,
    RouterLink,
    LogoComponent,
    LangSwitcherComponent,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit {
  public user?: CurrentUserDetails
  public config?: ConfigResponse
  public location = window.location

  public toggleSidenav = output()

  private userService = inject(UserService)
  private configService = inject(ConfigService)
  private spinnerService = inject(SpinnerService)

  async ngOnInit() {
    try {
      this.spinnerService.show()
      this.user = await this.userService.getMyUser()
      this.config = await this.configService.getConfig()
    } catch (_e) {
      // user just isn't logged in
    } finally {
      this.spinnerService.hide()
    }
  }
}
