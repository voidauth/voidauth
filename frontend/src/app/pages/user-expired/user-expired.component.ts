import { Component, inject, type OnInit } from '@angular/core'
import { ConfigService } from '../../services/config.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { MaterialModule } from '../../material-module'
import { Router, RouterLink } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { AuthService } from '../../services/auth.service'
import { SpinnerService } from '../../services/spinner.service'

@Component({
  selector: 'app-user-expired',
  imports: [MaterialModule, RouterLink, TranslatePipe],
  templateUrl: './user-expired.component.html',
  styleUrl: './user-expired.component.scss',
})

export class UserExpiredComponent implements OnInit {
  config?: ConfigResponse
  canRetry = true

  private configService = inject(ConfigService)
  private authService = inject(AuthService)
  private router = inject(Router)
  private spinnerService = inject(SpinnerService)

  async ngOnInit() {
    this.spinnerService.show()
    try {
      this.config = await this.configService.getConfig()
      // Check if interaction exists
      try {
        const info = await this.authService.interactionExists()
        // If the user is privileged now, we can attempt to retry the interaction without user trigger
        if (info.user?.isPrivileged) {
          try {
            const result = await this.authService.interactionTryAgain()
            window.location.href = result.location
          } catch (_error) {
            // If there's an error during the retry attempt, we cannot retry again (likely due to no lastSubmission)
            this.canRetry = false
            await this.router.navigate(['/'])
          }
        }
      } catch (_e) {
        // If the interaction does not exist, we cannot retry
        this.canRetry = false
      }
    } catch (_e) {
      // do nothing
    } finally {
      this.spinnerService.hide()
    }
  }

  async tryAgain() {
    this.spinnerService.show()
    try {
      // Only attempt to retry if we haven't determined that retrying is not possible
      if (!this.canRetry) {
        await this.router.navigate(['/'])
        return
      }
      // Check if interaction exists
      try {
        await this.authService.interactionExists()
      } catch (_e) {
        // If the interaction does not exist, we cannot retry
        this.canRetry = false
        await this.router.navigate(['/'])
        return
      }

      // If we get here, the interaction exists, so we can try to retry
      try {
        const result = await this.authService.interactionTryAgain()
        window.location.href = result.location
      } catch (_error) {
        // If there's an error during the retry attempt, we cannot retry again (likely due to no lastSubmission)
        this.canRetry = false
        await this.router.navigate(['/'])
        return
      }
    } catch (_e) {
      // do nothing
    } finally {
      this.spinnerService.hide()
    }
  }
}
