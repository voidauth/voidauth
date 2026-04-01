import { Component, inject, type OnInit } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { MaterialModule } from '../../../material-module'
import { HttpErrorResponse } from '@angular/common/http'
import { SnackbarService } from '../../../services/snackbar.service'
import { SpinnerService } from '../../../services/spinner.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { ConfigService, getCurrentHost } from '../../../services/config.service'
import { TranslatePipe } from '@ngx-translate/core'
import { UserService } from '../../../services/user.service'

@Component({
  selector: 'app-verify-sent',
  imports: [
    MaterialModule, TranslatePipe,
  ],
  templateUrl: './verify-sent.component.html',
  styleUrl: './verify-sent.component.scss',
})
export class VerifySentComponent implements OnInit {
  sent: boolean = false
  config?: ConfigResponse
  host = getCurrentHost()

  private router = inject(Router)
  private activatedRoute = inject(ActivatedRoute)
  private userService = inject(UserService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private configService = inject(ConfigService)

  async ngOnInit() {
    this.activatedRoute.queryParamMap.subscribe((queryParams) => {
      this.sent = queryParams.get('sent') === 'true'
    })

    try {
      this.spinnerService.show()
      this.config = await this.configService.getConfig()
    } finally {
      this.spinnerService.hide()
    }
  }

  public async sendVerification() {
    try {
      this.spinnerService.show()
      await this.userService.sendEmailVerification()
      await this.router.navigate([], {
        queryParams: {
          sent: true,
        },
        queryParamsHandling: 'merge',
      })
      this.snackbarService.message('Verification Email Re-Sent.')
    } catch (e) {
      console.error(e)
      let error: string | null = null

      if (e instanceof HttpErrorResponse) {
        error ??= e.error?.message
      } else {
        error ??= (e as Error).message
      }

      error ??= 'Something went wrong.'
      this.snackbarService.error(error)
    } finally {
      this.spinnerService.hide()
    }
  }
}
