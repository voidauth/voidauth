import { Component, inject, type OnInit } from "@angular/core"
import { RouterLink, RouterOutlet } from "@angular/router"
import { HeaderComponent } from "./components/header/header.component"
import { MaterialModule } from "./material-module"
import { UserService } from "./services/user.service"
import type { UserDetails } from "@shared/api-response/UserDetails"

@Component({
  selector: "app-root",
  imports: [
    RouterOutlet,
    MaterialModule,
    HeaderComponent,
    RouterLink,
  ],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.scss",
})
export class AppComponent implements OnInit {
  private user?: UserDetails
  public isAdmin: boolean = false

  private userService = inject(UserService)

  async ngOnInit() {
    try {
      this.user = await this.userService.getMyUser()
      this.isAdmin = this.userService.userIsAdmin(this.user)
    } catch (_e) {
      // user just isn't logged in
    }
  }
}
