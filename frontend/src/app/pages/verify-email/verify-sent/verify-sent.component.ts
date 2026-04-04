import { Component, inject, type OnInit } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { MaterialModule } from '../../../material-module'
import { HttpErrorResponse } from '@angular/common/http'
import { SnackbarService } from '../../../services/snackbar.service'
import { SpinnerService } from '../../../services/spinner.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { ConfigService, getCurrentHost } from '../../../services/config.service'
import { TranslatePipe } from '@ngx-translate/core'
import { UserService } from '../../../services/user.service'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { isValidEmail } from '../../../validators/validators'
import { ValidationErrorPipe } from '../../../pipes/ValidationErrorPipe'
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'
import { AsyncPipe } from '@angular/common'
import { REDIRECT_PATHS } from '@shared/constants'

@Component({
  selector: 'app-verify-sent',
  imports: [
    MaterialModule, TranslatePipe, ReactiveFormsModule, ValidationErrorPipe, AsyncPipe,
  ],
  templateUrl: './verify-sent.component.html',
  styleUrl: './verify-sent.component.scss',
})
export class VerifySentComponent implements OnInit {
  sent: boolean = false
  config?: ConfigResponse
  host = getCurrentHost()
  currentUser?: CurrentUserDetails

  public emailForm = new FormGroup({
    email: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required, isValidEmail]),
  })

  private router = inject(Router)
  private activatedRoute = inject(ActivatedRoute)
  private userService = inject(UserService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private configService = inject(ConfigService)

  async ngOnInit() {
    this.activatedRoute.queryParamMap.subscribe((queryParams) => {
      this.sent = queryParams.get('sent') === 'true'
    })

    try {
      this.spinnerService.show()
      this.config = await this.configService.getConfig()
      await this.loadUser()
    } finally {
      this.spinnerService.hide()
    }
  }

  private async loadUser() {
    try {
      this.currentUser = await this.userService.getMyUser({
        disableCache: true,
      })
    } catch (_e) {
      // If user cannot be loaded, this page won't work
      this.snackbarService.error('Could not load user details.')
    }

    if (!this.currentUser || this.currentUser.hasEmail) {
      this.emailForm.controls.email.disable()
    }
  }

  public async updateEmail() {
    try {
      this.spinnerService.show()
      const email = this.emailForm.value.email
      if (!email) {
        throw new Error('Email missing.')
      }
      const { sentVerification } = await this.userService.updateEmail({
        email: email,
      })
      // if email verification enabled, indicate that in message
      if (sentVerification) {
        await this.router.navigate([], {
          queryParams: {
            sent: true,
          },
          queryParamsHandling: 'merge',
        })
        this.snackbarService.message('Verification email sent.')
      } else {
        this.snackbarService.message('Email updated.')
        await this.router.navigate([REDIRECT_PATHS.LOGIN])
      }
    } catch (e) {
      console.error(e)
      this.snackbarService.error('Could not update email.')
    } finally {
      await this.loadUser()
      this.spinnerService.hide()
    }
  }

  public async sendVerification() {
    try {
      this.spinnerService.show()
      await this.userService.sendEmailVerification()
      await this.router.navigate([], {
        queryParams: {
          sent: true,
        },
        queryParamsHandling: 'merge',
      })
      this.snackbarService.message('Verification Email Re-Sent.')
    } catch (e) {
      console.error(e)
      let error: string | null = null

      if (e instanceof HttpErrorResponse) {
        error ??= e.error?.message
      } else {
        error ??= (e as Error).message
      }

      error ??= 'Something went wrong.'
      this.snackbarService.error(error)
    } finally {
      this.spinnerService.hide()
    }
  }

  async updateEmailOrSendVerification() {
    if (this.currentUser?.hasEmail) {
      await this.sendVerification()
    } else {
      await this.updateEmail()
    }
  }
}
