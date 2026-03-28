import { Component, inject, type OnDestroy, type OnInit } from '@angular/core'
import { AuthService } from '../../services/auth.service'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'
import { MaterialModule } from '../../material-module'
import { HttpErrorResponse } from '@angular/common/http'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'
import { SnackbarService } from '../../services/snackbar.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { ConfigService } from '../../services/config.service'
import { SpinnerService } from '../../services/spinner.service'
import { PasskeyService, type PasskeySupport } from '../../services/passkey.service'
import { WebAuthnAbortService } from '@simplewebauthn/browser'
import { TextDividerComponent } from '../../components/text-divider/text-divider.component'
import { TranslatePipe } from '@ngx-translate/core'
import { AsyncPipe } from '@angular/common'

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  imports: [
    ReactiveFormsModule,
    MaterialModule,
    ValidationErrorPipe,
    RouterLink,
    TextDividerComponent,
    TranslatePipe,
    AsyncPipe,
  ],
})
export class LoginComponent implements OnInit, OnDestroy {
  public config?: ConfigResponse

  public form = new FormGroup({
    email: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required]),

    password: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required]),

    rememberMe: new FormControl<boolean>({
      value: false,
      disabled: false,
    }, [Validators.required]),
  })

  public pwdShow: boolean = false
  public passkeySupport?: PasskeySupport
  interactionAvailable = true

  private authService = inject(AuthService)
  private configService = inject(ConfigService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  passkeyService = inject(PasskeyService)
  private router = inject(Router)

  async ngOnInit() {
    this.configService.getConfig().then(c => this.config = c).catch((e: unknown) => {
      throw e
    })

    try {
      this.spinnerService.show()

      this.passkeySupport = await this.passkeyService.getPasskeySupport()

      // interaction needed, check if one exists
      try {
        const info = await this.authService.interactionExists()
        if (info.successRedirect) {
          window.location.assign(info.successRedirect.location)
        }
      } catch (_e) {
        // interaction is missing, could not log in without it
        await this.authService.createInteraction()
        try {
          await this.authService.interactionExists()
        } catch (e) {
          // attempted to create interaction and failed
          console.error(e)
          this.snackbarService.error('Could not create session.')
          this.interactionAvailable = false
        }
      }

      if (!this.interactionAvailable) {
        this.form.disable()
      }
    } finally {
      this.spinnerService.hide()
    }
  }

  ngOnDestroy(): void {
    WebAuthnAbortService.cancelCeremony()
  }

  async login() {
    const { email, password, rememberMe: remember } = this.form.value
    this.spinnerService.show()
    try {
      if (!email || !password) {
        throw new Error('Invalid email or password')
      }

      const redirect = await this.authService.login({ input: email, password, remember: !!remember })

      // See if we want to ask the user to register a passkey
      try {
        const user = (await this.authService.interactionExists()).user
        if (user && await this.passkeyService.shouldAskPasskey(user)) {
          this.spinnerService.hide()
          await this.passkeyService.dialogRegistration()
        }
      } catch (_e) {
        // do nothing
      }

      if (redirect) {
        location.assign(redirect.location)
      } else {
        await this.router.navigate(['/'])
        return
      }
    } catch (e) {
      let shownError: string | null = null

      if (e instanceof HttpErrorResponse) {
        const status = e.status

        if (status === 401) {
          shownError = 'Invalid username or password.'
        } else if (status === 404) {
          shownError = 'User not found.'
        }

        shownError ??= e.error?.message
      } else {
        shownError ??= (e as Error).message
      }

      console.error(e)
      shownError ??= 'Something went wrong.'
      this.snackbarService.error(shownError)
    } finally {
      this.spinnerService.hide()
    }
  }

  async passkeyLogin(auto: boolean) {
    try {
      const redirect = await this.passkeyService.login(!!this.form.value.rememberMe)
      if (redirect) {
        location.assign(redirect.location)
      }
    } catch (error) {
      if (!auto) {
        this.snackbarService.error('Could not login with passkey.')
      }
      console.error(error)
    }
  }
}
