import { Component, inject, type OnInit } from '@angular/core'
import { ConfigService } from '../../services/config.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { MaterialModule } from '../../material-module'
import { Router, RouterLink } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { AuthService } from '../../services/auth.service'

@Component({
  selector: 'app-approval-required',
  imports: [MaterialModule, RouterLink, TranslatePipe],
  templateUrl: './approval-required.component.html',
  styleUrl: './approval-required.component.scss',
})

export class ApprovalRequiredComponent implements OnInit {
  config?: ConfigResponse

  configService = inject(ConfigService)
  authService = inject(AuthService)
  router = inject(Router)

  async ngOnInit() {
    this.config = await this.configService.getConfig()
  }

  async tryAgain() {
    try {
      try {
        const info = await this.authService.interactionExists()
        if (info.user?.isPrivileged) {
          await this.router.navigate(['/'])
          return
        }
      } catch (_e) {
        await this.router.navigate(['/'])
        return
      }
      const result = await this.authService.interactionTryAgain()
      if (result.location) {
        window.location.href = result.location
      }
    } catch (error) {
      console.error('Failed to try again:', error)
    }
  }
}
