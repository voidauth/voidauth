import { CommonModule } from '@angular/common'
import { Component, inject, type OnInit } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { AuthService } from '../../../services/auth.service'
import { HttpErrorResponse } from '@angular/common/http'
import { MaterialModule } from '../../../material-module'
import { SnackbarService } from '../../../services/snackbar.service'
import { SpinnerService } from '../../../services/spinner.service'
import { ConfigService } from '../../../services/config.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { UserService } from '../../../services/user.service'
import { PasskeyService } from '../../../services/passkey.service'

@Component({
  selector: 'app-verify',
  imports: [
    CommonModule,
    MaterialModule,
  ],
  templateUrl: './verify.component.html',
  styleUrl: './verify.component.scss',
})
export class VerifyComponent implements OnInit {
  title: string = 'Verifying Email...'
  userid?: string
  config?: ConfigResponse

  private activatedRoute = inject(ActivatedRoute)
  private authService = inject(AuthService)
  private userService = inject(UserService)
  private passkeyService = inject(PasskeyService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private configService = inject(ConfigService)

  async ngOnInit() {
    const params = this.activatedRoute.snapshot.paramMap

    try {
      this.title = 'Verifying Email...'

      this.spinnerService.show()

      try {
        await this.authService.interactionExists()
      } catch (_e) {
        await this.authService.createInteraction()
      }

      this.config = await this.configService.getConfig()

      const id = params.get('id')
      const challenge = params.get('challenge')

      if (!id || !challenge) {
        throw new Error('Invalid Verification.')
      }

      this.userid = id

      const redirect = await this.authService.verifyEmail({
        userId: this.userid,
        challenge: challenge,
      })

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
      }
    } catch (e) {
      console.error(e)
      let error: string

      if (e instanceof HttpErrorResponse) {
        error ||= e.error?.message
      } else {
        error ||= (e as Error).message
      }

      error ||= 'Something went wrong.'
      this.snackbarService.error(error)
      this.title = 'Email Could Not Be Verified :('
    } finally {
      this.spinnerService.hide()
    }
  }

  public async sendVerification() {
    this.title = 'Sending New Verification...'
    try {
      this.spinnerService.show()
      if (!this.userid) {
        throw new Error('Missing User ID.')
      }
      await this.authService.sendEmailVerification({ id: this.userid })
    } catch (e) {
      console.error(e)
      let error: string

      if (e instanceof HttpErrorResponse) {
        error ||= e.error?.message
      } else {
        error ||= (e as Error).message
      }

      error ||= 'Something went wrong.'
      this.title = 'Email Verification Could Not Be Sent :('
      this.snackbarService.error(error)
    } finally {
      this.spinnerService.hide()
    }
  }
}
