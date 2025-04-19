import { Component, inject, output, type OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router, RouterLink } from '@angular/router';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { MaterialModule } from '../../material-module';
import { CommonModule } from '@angular/common';
import { UserService } from '../../services/user.service';
import { ADMIN_GROUP } from '@shared/constants';
import type { UserDetails } from '@shared/api-response/UserDetails';
import { oidcLoginPath } from '@shared/utils';
import { ConfigService } from '../../services/config.service';

@Component({
    selector: 'app-header',
    imports: [
        CommonModule,
        MaterialModule,
        ThemeToggleComponent,
        RouterLink,
    ],
    templateUrl: './header.component.html',
    styleUrl: './header.component.scss'
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

  constructor(){}

  async ngOnInit() {
    this.loginRedirect = oidcLoginPath(this.configService.getCurrentHost())
    
    try {
      this.userLoading = true
      this.user = await this.userService.getMyUser()
      this.isAdmin = this.user.groups.some((g) => g === ADMIN_GROUP)
    } catch (e) {
      // user just isn't logged in
    } finally {
      this.userLoading = false
    }
  }
}
