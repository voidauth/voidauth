import { CommonModule } from "@angular/common"
import { Component, inject, type OnInit } from "@angular/core"
import { ActivatedRoute } from "@angular/router"
import { AuthService } from "../../../services/auth.service"
import { HttpErrorResponse } from "@angular/common/http"
import { MaterialModule } from "../../../material-module"
import { SnackbarService } from "../../../services/snackbar.service"
import { SpinnerService } from "../../../services/spinner.service"

@Component({
  selector: "app-verify",
  imports: [
    CommonModule,
    MaterialModule,
  ],
  templateUrl: "./verify.component.html",
  styleUrl: "./verify.component.scss",
})
export class VerifyComponent implements OnInit {
  title: string = "Verifying Email..."
  userid?: string

  private activatedRoute = inject(ActivatedRoute)
  private authService = inject(AuthService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)

  async ngOnInit() {
    const params = this.activatedRoute.snapshot.paramMap

    try {
      this.title = "Verifying Email..."

      this.spinnerService.show()

      const id = params.get("id")
      const challenge = params.get("challenge")

      if (!id || !challenge) {
        throw new Error("Invalid Verification.")
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

      error ||= "Something went wrong."
      this.snackbarService.error(error)
      this.title = "Email Could Not Be Verified :("
    } finally {
      this.spinnerService.hide()
    }
  }

  public async sendVerification() {
    this.title = "Sending New Verification..."
    try {
      this.spinnerService.show()
      if (!this.userid) {
        throw new Error("Missing User ID.")
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

      error ||= "Something went wrong."
      this.title = "Email Verification Could Not Be Sent :("
      this.snackbarService.error(error)
    } finally {
      this.spinnerService.hide()
    }
  }
}
