import { Component, inject, type OnInit } from "@angular/core"
import { MaterialModule } from "../../material-module"
import { CopyFieldComponent } from "../copy-field/copy-field.component"
import { ConfigService, type WellknownConfig } from "../../services/config.service"
import { SpinnerService } from "../../services/spinner.service"

@Component({
  selector: "app-oidc-info",
  imports: [
    MaterialModule,
    CopyFieldComponent,
  ],
  templateUrl: "./oidc-info.component.html",
  styleUrl: "./oidc-info.component.scss",
})
export class OidcInfoComponent implements OnInit {
  private spinnerService = inject(SpinnerService)
  private configService = inject(ConfigService)

  oidcConfig?: WellknownConfig
  currentHost: string = this.configService.getCurrentHost()

  async ngOnInit() {
    try {
      this.spinnerService.show()
    } finally {
      this.spinnerService.hide()
    }
    this.oidcConfig = await this.configService.getOIDCWellknown()
  }
}
