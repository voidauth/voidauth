import { Component, inject, type OnInit } from '@angular/core'
import { RouterLink, RouterOutlet } from '@angular/router'
import { HeaderComponent } from './components/header/header.component'
import { MaterialModule } from './material-module'
import { UserService } from './services/user.service'
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'
import { SpinnerService } from './services/spinner.service'
import { getCurrentHost } from './services/config.service'
import { isAdmin } from '@shared/user'

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    MaterialModule,
    HeaderComponent,
    RouterLink,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  user?: CurrentUserDetails
  isAdmin: boolean = false
  host = getCurrentHost()

  private userService = inject(UserService)
  private spinnerService = inject(SpinnerService)

  async ngOnInit() {
    try {
      this.spinnerService.show()
      this.user = await this.userService.getMyUser()
      this.isAdmin = isAdmin(this.user)
    } catch (_e) {
      // user just isn't logged in
    } finally {
      this.spinnerService.hide()
    }
  }
}
