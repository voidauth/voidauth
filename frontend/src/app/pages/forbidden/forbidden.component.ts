import { Component, inject, type OnInit } from '@angular/core'
import { ConfigService } from '../../services/config.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { MaterialModule } from '../../material-module'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  selector: 'app-forbidden',
  imports: [MaterialModule, TranslatePipe],
  templateUrl: './forbidden.component.html',
  styleUrl: './forbidden.component.scss',
})

export class ForbiddenComponent implements OnInit {
  config?: ConfigResponse

  history = window.history

  configService = inject(ConfigService)

  async ngOnInit() {
    this.config = await this.configService.getConfig()
  }
}
