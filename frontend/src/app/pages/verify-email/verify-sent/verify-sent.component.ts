import { Component, inject, type OnInit } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { MaterialModule } from '../../../material-module'
import { AuthService } from '../../../services/auth.service'
import { HttpErrorResponse } from '@angular/common/http'
import { SnackbarService } from '../../../services/snackbar.service'
import { SpinnerService } from '../../../services/spinner.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { ConfigService, getCurrentHost } from '../../../services/config.service'

@Component({
  selector: 'app-verify-sent',
  imports: [
    MaterialModule,
  ],
  templateUrl: './verify-sent.component.html',
  styleUrl: './verify-sent.component.scss',
})
export class VerifySentComponent implements OnInit {
  sent: boolean = false
  userId: string | null = null
  config?: ConfigResponse
  host = getCurrentHost()

  private router = inject(Router)
  private activatedRoute = inject(ActivatedRoute)
  private authService = inject(AuthService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private configService = inject(ConfigService)

  async ngOnInit() {
    this.activatedRoute.queryParamMap.subscribe((queryParams) => {
      this.sent = queryParams.get('sent') === 'true'
    })

    this.activatedRoute.paramMap.subscribe((paramMap) => {
      this.userId = paramMap.get('id')
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
      if (!this.userId) {
        throw new Error('Missing User ID.')
      }
      await this.authService.sendEmailVerification({ id: this.userId })
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
