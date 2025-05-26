import { Component, inject, type OnInit } from "@angular/core"
import { AuthService } from "../../services/auth.service"
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms"
import { CommonModule } from "@angular/common"
import { MaterialModule } from "../../material-module"
import { ActivatedRoute, RouterLink } from "@angular/router"
import { HttpErrorResponse } from "@angular/common/http"
import { ValidationErrorPipe } from "../../pipes/ValidationErrorPipe"
import { SnackbarService } from "../../services/snackbar.service"
import { emptyOrMinLength } from "../../validators/validators"
import { USERNAME_REGEX } from "@shared/constants"
import type { InvitationDetails } from "@shared/api-response/InvitationDetails"
import { ConfigService } from "../../services/config.service"
import { oidcLoginPath } from "@shared/oidc"
import { NewPasswordInputComponent } from "../../components/new-password-input/new-password-input.component"
@Component({
  selector: "app-registration",
  templateUrl: "./registration.component.html",
  styleUrls: ["./registration.component.scss"],
  imports: [
    ReactiveFormsModule,
    MaterialModule,
    CommonModule,
    ValidationErrorPipe,
    RouterLink,
    NewPasswordInputComponent,
  ],
})
export class RegistrationComponent implements OnInit {
  public form = new FormGroup({
    username: new FormControl<string>({
      value: "",
      disabled: false,
    }, [Validators.required, Validators.minLength(4), Validators.pattern(USERNAME_REGEX)]),

    email: new FormControl<string>({
      value: "",
      disabled: false,
    }, [Validators.email]),

    name: new FormControl<string | null>({
      value: null,
      disabled: false,
    }, [emptyOrMinLength(4)]),

    password: new FormControl<string>({
      value: "",
      disabled: false,
    }, [Validators.required, Validators.minLength(8)]),
  })

  public invitation?: InvitationDetails

  public pwdShow: boolean = false

  private snackbarService = inject(SnackbarService)
  private authService = inject(AuthService)
  private configService = inject(ConfigService)
  private route = inject(ActivatedRoute)

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(async (queryParams) => {
      const inviteId = queryParams.get("invite")
      const challenge = queryParams.get("challenge")

      if (inviteId && challenge) {
        try {
          this.invitation = await this.authService.getInviteDetails(inviteId, challenge)
        } catch (e) {
          this.snackbarService.error("Invalid invite link.")
          console.error(e)
          return
        }

        if (this.invitation.username) {
          this.form.controls.username.reset(this.invitation.username)
          this.form.controls.username.disable()
        }

        if (this.invitation.email) {
          this.form.controls.email.reset(this.invitation.email)
          this.form.controls.email.disable()
        }

        if (this.invitation.name) {
          this.form.controls.name.reset(this.invitation.name)
          this.form.controls.name.disable()
        }

        if ((await this.configService.getConfig()).emailVerification) {
          this.form.controls.email.addValidators(Validators.required)
        }
      }

      try {
        await this.authService.interactionExists()
      } catch (_e) {
        // interaction session is missing, could not log in without it
        window.location.assign(oidcLoginPath(this.configService.getCurrentHost(), "register", inviteId, challenge))
      }
    })
  }

  async register() {
    try {
      const redirect = await this.authService.register({
        ...this.form.getRawValue(),
        inviteId: this.invitation?.id,
        challenge: this.invitation?.challenge,
      })
      location.assign(redirect.location)
    } catch (e) {
      console.error(e)

      let shownError: string | null = null
      if (e instanceof HttpErrorResponse) {
        shownError ??= e.error?.message
      } else {
        shownError ??= (e as Error).message
      }

      shownError ??= "Something went wrong."
      this.snackbarService.error(shownError)
    }
  }
}
