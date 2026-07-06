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
  protected isSubmitting = false

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

  protected async onSubmit(event: SubmitEvent) {
    event.preventDefault()

    if (this.isSubmitting) return

    const form = event.currentTarget
    if (!(form instanceof HTMLFormElement)) return

    const formData = new FormData(form)
    const body = new URLSearchParams()
    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string') {
        body.append(key, value)
      }
    }

    try {
      this.isSubmitting = true
      this.spinnerService.show(true)

      const response = await fetch(form.action, {
        method: 'POST',
        body: body.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        credentials: 'include',
        redirect: 'manual',
      })

      const location = response.headers.get('location')
      if (location) {
        window.location.assign(location)
        return
      }

      if (response.status >= 400) {
        throw new Error('Logout failed. Please try again.')
      }
    } finally {
      this.isSubmitting = false
      this.spinnerService.hide()
    }
  }
}
