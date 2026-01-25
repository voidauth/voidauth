import { Component, inject, type OnInit } from '@angular/core'
import { MaterialModule } from '../../material-module'
import { RouterLink } from '@angular/router'
import { ConfigService } from '../../services/config.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'

@Component({
  selector: 'app-not-found',
  imports: [MaterialModule, RouterLink],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.scss',
})
export class NotFoundComponent implements OnInit {
  config?: ConfigResponse

  private configService = inject(ConfigService)

  async ngOnInit() {
    this.config = await this.configService.getConfig()
  }
}
