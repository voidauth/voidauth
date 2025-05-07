import { CommonModule } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, inject } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { MaterialModule } from '../../material-module'
import { AuthService } from '../../services/auth.service'
import { SnackbarService } from '../../services/snackbar.service'

@Component({
  selector: 'app-reset-password',
  imports: [
    CommonModule,
    MaterialModule,
  ],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent {
  title: string = 'Reset Password'
  userid?: string
  challenge?: string

  private activatedRoute = inject(ActivatedRoute)
  private authService = inject(AuthService)
  private snackbarService = inject(SnackbarService)

  async ngOnInit() {
    const params = this.activatedRoute.snapshot.paramMap

    try {
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

      // Not always verified email
      // interaction session might not exist and redirect is to get it

      location.assign(redirect.location)
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
      this.title = 'Password Reset Link Invalid :('
    }
  }
}
