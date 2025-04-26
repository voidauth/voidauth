import { Component, inject, type OnInit } from '@angular/core'
import { RouterLink, RouterOutlet } from '@angular/router'
import { HeaderComponent } from './components/header/header.component'
import { MaterialModule } from './material-module'
import { UserService } from './services/user.service'
import { ConfigService } from './services/config.service'
import { ADMIN_GROUP } from '@shared/constants'
import type { UserDetails } from '@shared/api-response/UserDetails'
import { Title } from '@angular/platform-browser'

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
  private user?: UserDetails
  public isAdmin: boolean = false

  private userService = inject(UserService)
  private configService = inject(ConfigService)
  private titleService = inject(Title)

  constructor() {
    this.configService.getConfig().then((c) => {
      this.titleService.setTitle(c.appName)
    }).catch((_e: unknown) => {
      console.error('Could not set <title>.')
    })
  }

  async ngOnInit() {
    try {
      this.user = await this.userService.getMyUser()
      this.isAdmin = this.user.groups.some(g => g === ADMIN_GROUP)
    } catch (_e) {
      // user just isn't logged in
    }
  }
}
