import { Component, inject, type OnInit } from '@angular/core'
import { MaterialModule } from '../../material-module'
import { ActivatedRoute, Router } from '@angular/router'
import { getCurrentHost } from '../../services/config.service'
import { UserService } from '../../services/user.service'
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  selector: 'app-logout',
  imports: [
    MaterialModule,
    TranslatePipe,
  ],
  templateUrl: './logout.component.html',
  styleUrl: './logout.component.scss',
})
export class LogoutComponent implements OnInit {
  protected challenge?: string
  user?: CurrentUserDetails

  private route = inject(ActivatedRoute)
  private userService = inject(UserService)
  private router = inject(Router)

  public host = getCurrentHost()

  history = window.history

  async ngOnInit() {
    const params = this.route.snapshot.paramMap

    try {
      this.user = await this.userService.getMyUser()
    } catch (_e) {
      // User is not logged in, and therefore cannot log out
      await this.router.navigate(['/'], {
        replaceUrl: true,
      })
      return
    }

    const challenge = params.get('challenge')
    if (challenge) {
      this.challenge = challenge
    } else {
      window.location.assign(`${this.host}/oidc/session/end`)
    }
  }
}
