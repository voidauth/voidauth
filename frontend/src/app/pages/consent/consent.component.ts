import { Component, inject, type OnInit } from '@angular/core'
import { AuthService } from '../../services/auth.service'
import { ActivatedRoute } from '@angular/router'
import { HttpErrorResponse } from '@angular/common/http'
import { SnackbarService } from '../../services/snackbar.service'
import { MaterialModule } from '../../material-module'
import type { ConsentDetails } from '@shared/api-response/ConsentDetails'
import { SpinnerService } from '../../services/spinner.service'

@Component({
  selector: 'app-consent',
  imports: [
    MaterialModule,
  ],
  templateUrl: './consent.component.html',
  styleUrl: './consent.component.scss',
})
export class ConsentComponent implements OnInit {
  public uid: string | null = null
  public details?: ConsentDetails
  public redirectHost?: string

  private authService = inject(AuthService)
  private route = inject(ActivatedRoute)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)

  ngOnInit() {
    this.route.paramMap.subscribe(async (paramMap) => {
      try {
        this.spinnerService.show()
        this.uid = paramMap.get('uid')
        if (!this.uid) {
          throw new Error('UID param missing from page.')
        }
        this.details = await this.authService.getInteractionDetails(this.uid)
        const url = URL.parse(this.details.redirectUri)
        this.redirectHost = url?.host
      } catch (e) {
        console.error(e)
        this.snackbarService.error('Confirmation details not valid.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }

  async submit() {
    try {
      this.spinnerService.show()
      if (!this.uid) {
        throw Error('Interaction ID missing from login')
      }

      await this.authService.consent(this.uid)
    } catch (e) {
      console.error(e)
      let shownError: string | null = null

      if (e instanceof HttpErrorResponse) {
        shownError ??= e.error?.message
      } else {
        shownError ??= (e as Error).message
      }

      shownError ??= 'Something went wrong.'
      this.snackbarService.error(shownError)
    } finally {
      this.spinnerService.hide()
    }
  }
}
