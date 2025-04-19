import { Component, inject, type OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common'; 
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MaterialModule } from '../../material-module';
import { HttpErrorResponse } from '@angular/common/http';
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe';
import { SnackbarService } from '../../services/snackbar.service';
import type { ConfigResponse } from '@shared/api-response/ConfigResponse';
import { ConfigService } from '../../services/config.service';
import { UserService } from '../../services/user.service';
import { oidcLoginPath } from '@shared/utils';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    imports: [
        ReactiveFormsModule,
        FormsModule,
        CommonModule,
        MaterialModule,
        ValidationErrorPipe,
        RouterLink,
    ]
})
export class LoginComponent implements OnInit {   

  public config?: ConfigResponse

  public form = new FormGroup({
    email: new FormControl<string>({
      value: '',
      disabled: false
    }, [Validators.required]),
  
    password: new FormControl<string>({
      value: '',
      disabled: false
    }, [Validators.required]),
  
    rememberMe: new FormControl<boolean>({
      value: false,
      disabled: false
    }, [Validators.required]),
  })  

  public pwdShow: boolean = false

  private authService = inject(AuthService)
  private userService = inject(UserService)
  private configService = inject(ConfigService)
  private router = inject(Router)
  private snackbarService = inject(SnackbarService)

  constructor() {}

  async ngOnInit() {
    this.config = await this.configService.getConfig()
    try {
      const user = await this.userService.getMyUser()
      if (user) {
        // The user is already logged in
        this.router.navigate(["/"], {
          replaceUrl: true
        })
        return
      }
    } catch (e) {
      // This is expected, that the user is not logged in
    }

    try {
      await this.authService.interactionExists()
    } catch (e) {
      // interaction session is missing, could not log in without it
      window.location.assign(oidcLoginPath(this.configService.getCurrentHost(), 'login'))
    }
  }

  async login() {
    const { email, password, rememberMe: remember } = this.form.value
    try {
      if (!email || !password) {
        throw new Error("Invalid email or password")
      }

      const redirect = await this.authService.login({input: email, password, remember: !!remember})

      window.location.assign(redirect.location);
    } catch (e) {
      let shownError: string

      if (e instanceof HttpErrorResponse) {
        const status = e.status

        if (status === 401) {
          shownError = "Invalid username or password."
        } else if (status === 404) {
          shownError = "User not found."
        }

        shownError ??= e.error?.message
      } else {
        shownError ??= (e as Error)?.message
      }

      console.error(e)
      shownError ??= "Something went wrong."
      this.snackbarService.error(shownError)
    }
  }
}