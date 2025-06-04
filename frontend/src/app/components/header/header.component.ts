import { Component, inject, output, type OnInit } from "@angular/core"
import { Router, RouterLink } from "@angular/router"
import { ThemeToggleComponent } from "../theme-toggle/theme-toggle.component"
import { MaterialModule } from "../../material-module"
import { UserService } from "../../services/user.service"
import type { UserDetails } from "@shared/api-response/UserDetails"
import { ConfigService } from "../../services/config.service"
import { oidcLoginPath } from "@shared/oidc"

@Component({
  selector: "app-header",
  imports: [
    MaterialModule,
    ThemeToggleComponent,
    RouterLink,
  ],
  templateUrl: "./header.component.html",
  styleUrl: "./header.component.scss",
})
export class HeaderComponent implements OnInit {
  public userLoading: boolean = false
  public user?: UserDetails
  public isAdmin: boolean = false
  public loginRedirect?: string

  public toggleSidenav = output()

  private userService = inject(UserService)
  private configService = inject(ConfigService)
  public router = inject(Router)

  async ngOnInit() {
    this.loginRedirect = oidcLoginPath(this.configService.getCurrentHost() + "/api/cb")

    try {
      this.userLoading = true
      this.user = await this.userService.getMyUser()
      this.isAdmin = this.userService.userIsAdmin(this.user)
    } catch (_e) {
      // user just isn't logged in
    } finally {
      this.userLoading = false
    }
  }
}
