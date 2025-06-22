import { Component, inject, type OnInit } from "@angular/core"
import { MaterialModule } from "../../material-module"
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms"
import { ValidationErrorPipe } from "../../pipes/ValidationErrorPipe"
import { SnackbarService } from "../../services/snackbar.service"
import { UserService } from "../../services/user.service"
import { USERNAME_REGEX } from "@shared/constants"
import type { UserDetails } from "@shared/api-response/UserDetails"
import { ConfigService } from "../../services/config.service"
import { PasswordSetComponent } from "../../components/password-reset/password-set.component"
import { SpinnerService } from "../../services/spinner.service"

@Component({
  selector: "app-home",
  imports: [
    ReactiveFormsModule,
    MaterialModule,
    ValidationErrorPipe,
    PasswordSetComponent,
  ],
  templateUrl: "./home.component.html",
  styleUrl: "./home.component.scss",
})
export class HomeComponent implements OnInit {
  user?: UserDetails
  public message?: string
  public error?: string

  public profileForm = new FormGroup({
    username: new FormControl<string>({
      value: "",
      disabled: false,
    }, [Validators.required, Validators.minLength(4), Validators.pattern(USERNAME_REGEX)]),
    name: new FormControl<string>({
      value: "",
      disabled: false,
    }, [Validators.minLength(4)]),
  })

  public emailForm = new FormGroup({
    email: new FormControl<string>({
      value: "",
      disabled: false,
    }, [Validators.required, Validators.email]),
  })

  public passwordForm = new FormGroup({
    oldPassword: new FormControl<string>({
      value: "",
      disabled: false,
    }, [Validators.required]),
    newPassword: new FormControl<string>({
      value: "",
      disabled: false,
    }, [Validators.required]),
    confirmPassword: new FormControl<string>({
      value: "",
      disabled: false,
    }, [Validators.required]),
  }, {
    validators: (g) => {
      const passAreEqual = g.get("newPassword")?.value === g.get("confirmPassword")?.value
      if (!passAreEqual) {
        g.get("confirmPassword")?.setErrors({ notEqual: "Must equal Password" })
        return { notEqual: "Passwords do not match" }
      }
      g.get("confirmPassword")?.setErrors(null)
      return null
    },
  })

  private configService = inject(ConfigService)
  private userService = inject(UserService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)

  async ngOnInit() {
    await this.loadUser()
  }

  async loadUser() {
    try {
      this.spinnerService.show()
      this.user = await this.userService.getMyUser()

      this.profileForm.reset({
        username: this.user.username,
        name: this.user.name ?? "",
      })
      this.emailForm.reset({
        email: this.user.email,
      })
      this.passwordForm.reset()
    } finally {
      this.spinnerService.hide()
    }
  }

  async updateProfile() {
    try {
      this.spinnerService.show()
      if (!this.profileForm.value.username) {
        throw new Error("Username is required.")
      }

      await this.userService.updateProfile({
        username: this.profileForm.value.username,
        name: this.profileForm.value.name ?? undefined,
      })
      this.snackbarService.show("Profile updated.")
    } catch (_e) {
      this.snackbarService.error("Could not update profile.")
    } finally {
      await this.loadUser()
      this.spinnerService.hide()
    }
  }

  async updatePassword() {
    try {
      this.spinnerService.show()
      const { oldPassword, newPassword } = this.passwordForm.value
      if (!oldPassword || !newPassword) {
        throw new Error("Password missing.")
      }

      await this.userService.updatePassword({
        oldPassword: oldPassword,
        newPassword: newPassword,
      })
      this.snackbarService.show("Password updated.")
      await this.loadUser()
    } catch (_e) {
      this.snackbarService.error("Could not update password.")
    } finally {
      this.spinnerService.hide()
    }
  }

  async updateEmail() {
    try {
      this.spinnerService.show()
      const email = this.emailForm.value.email
      if (!email) {
        throw new Error("Email missing.")
      }
      await this.userService.updateEmail({
        email: email,
      })
      // if email verification enabled, indicate that in message
      if ((await this.configService.getConfig()).emailVerification) {
        this.snackbarService.show("Verification email sent.")
      } else {
        this.snackbarService.show("Email updated.")
      }
    } catch (_e) {
      this.snackbarService.error("Could not update email.")
    } finally {
      await this.loadUser()
      this.spinnerService.hide()
    }
  }
}
