import { Component, inject, type OnInit } from '@angular/core'
import { MaterialModule } from '../../material-module'
import { ActivatedRoute, Router } from '@angular/router'
import { getBaseHrefPath } from '../../services/config.service'
import { UserService } from '../../services/user.service'
import type { CurrentUserDetails, CurrentUserPrivateDetails } from '@shared/api-response/UserDetails'
import { TranslatePipe } from '@ngx-translate/core'
import { SpinnerService } from '../../services/spinner.service'

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
  privUser?: CurrentUserPrivateDetails

  private route = inject(ActivatedRoute)
  private userService = inject(UserService)
  private router = inject(Router)
  private spinnerService = inject(SpinnerService)

  public baseHref = getBaseHrefPath()

  history = window.history

  async ngOnInit() {
    const params = this.route.snapshot.paramMap

    try {
      this.spinnerService.show()
      this.user = await this.userService.getMyUser()
      if (this.user.isPrivileged) {
        try {
          this.privUser = await this.userService.getMyPrivateUser()
        } catch (_e) {
          // do nothing
        }
      }
    } catch (_e) {
      // User is not logged in, and therefore cannot log out
      await this.router.navigate(['/'], {
        replaceUrl: true,
      })
      return
    } finally {
      this.spinnerService.hide()
    }

    const challenge = params.get('challenge')
    if (challenge) {
      this.challenge = challenge
    } else {
      this.spinnerService.show(true)
      window.location.assign(`${this.baseHref}/oidc/session/end`)
    }
  }
}
