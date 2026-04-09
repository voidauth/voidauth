import { Component, inject, type OnInit } from '@angular/core'
import { ConfigService } from '../../services/config.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { MaterialModule } from '../../material-module'
import { RouterLink } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  selector: 'app-user-expired',
  imports: [MaterialModule, RouterLink, TranslatePipe],
  templateUrl: './user-expired.component.html',
  styleUrl: './user-expired.component.scss',
})

export class UserExpiredComponent implements OnInit {
  config?: ConfigResponse

  configService = inject(ConfigService)

  async ngOnInit() {
    this.config = await this.configService.getConfig()
  }
}
