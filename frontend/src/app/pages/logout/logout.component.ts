import { Component, inject, type OnInit } from "@angular/core"
import { MaterialModule } from "../../material-module"
import { ActivatedRoute } from "@angular/router"
import { SnackbarService } from "../../services/snackbar.service"
import { ConfigService } from "../../services/config.service"

@Component({
  selector: "app-logout",
  imports: [
    MaterialModule,
  ],
  templateUrl: "./logout.component.html",
  styleUrl: "./logout.component.scss",
})
export class LogoutComponent implements OnInit {
  protected secret?: string

  private configService = inject(ConfigService)
  private route = inject(ActivatedRoute)
  private snackbarService = inject(SnackbarService)

  public host = this.configService.getCurrentHost()

  ngOnInit() {
    const params = this.route.snapshot.paramMap

    const secret = params.get("secret")
    if (secret) {
      this.secret = secret
    } else {
      this.snackbarService.error("Invalid logout request.")
    }
  }
}
