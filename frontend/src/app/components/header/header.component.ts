import { Component, inject, output, type OnInit } from '@angular/core'
import { RouterLink } from '@angular/router'
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component'
import { MaterialModule } from '../../material-module'
import { UserService } from '../../services/user.service'
import type { UserDetails } from '@shared/api-response/UserDetails'
import { ConfigService, getBaseHrefPath, getCurrentHost } from '../../services/config.service'
import { oidcLoginPath } from '@shared/oidc'
import { SpinnerService } from '../../services/spinner.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { LogoComponent } from './logo.component'

@Component({
  selector: 'app-header',
  imports: [
    MaterialModule,
    ThemeToggleComponent,
    RouterLink,
    LogoComponent,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit {
  public user?: UserDetails
  public isAdmin: boolean = false
  public loginRedirect?: string
  public config?: ConfigResponse
  public location = window.location

  public toggleSidenav = output()

  private userService = inject(UserService)
  private configService = inject(ConfigService)
  private spinnerService = inject(SpinnerService)

  async ngOnInit() {
    this.loginRedirect = getBaseHrefPath() + oidcLoginPath(getCurrentHost() + '/api/cb')

    try {
      this.spinnerService.show()
      this.user = await this.userService.getMyUser()
      this.isAdmin = this.userService.userIsAdmin(this.user)
      this.config = await this.configService.getConfig()
    } catch (_e) {
      // user just isn't logged in
    } finally {
      this.spinnerService.hide()
    }
  }
}
