import { Component, inject, type OnInit } from '@angular/core';
import { MaterialModule } from '../../material-module';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe';
import { SnackbarService } from '../../services/snackbar.service';
import { UserService } from '../../services/user.service';
import { emptyOrMinLength } from '../../validators/validators';
import { USERNAME_REGEX } from '@shared/constants';
import type { UserDetails } from '@shared/api-response/UserDetails';
import { ConfigService } from '../../services/config.service';
import { oidcLoginPath } from '@shared/oidc';

@Component({
    selector: 'app-home',
    imports: [
        FormsModule,
        ReactiveFormsModule,
        CommonModule,
        MaterialModule,
        ValidationErrorPipe
    ],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit{
  hasLoaded: boolean = false
  user?: UserDetails
  public message?: string
  public error?: string
  public pwdShow: boolean = false

  public profileForm = new FormGroup({
    username: new FormControl<string>({
      value: "",
      disabled: false
    }, [Validators.required, Validators.minLength(4), Validators.pattern(USERNAME_REGEX)]),
    name: new FormControl<string>({
      value: "",
      disabled: false
    }, [emptyOrMinLength(4)])
  })

  public passwordForm = new FormGroup({
    oldPassword: new FormControl<string>({
      value: "",
      disabled: false
    }, [Validators.required]),
    newPassword: new FormControl<string>({
      value: "",
      disabled: false
    }, [Validators.required, Validators.minLength(8)]),
    confirmPassword: new FormControl<string>({
      value: "",
      disabled: false
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
    }
  })

  public emailForm = new FormGroup({
    email: new FormControl<string>({
      value: "",
      disabled: false
    }, [Validators.required, Validators.email])
  })

  private configService = inject(ConfigService)
  private userService = inject(UserService)
  private snackbarService = inject(SnackbarService)

  constructor() {}

  async ngOnInit() {
    this.disablePage()
    await this.loadUser()
    this.enablePage()
  }

  disablePage() {
    this.profileForm.disable()
    this.passwordForm.disable()
    this.emailForm.disable()
  }

  enablePage() {
    this.profileForm.enable()
    this.passwordForm.enable()
    this.emailForm.enable()
  }

  async loadUser() {
    try {
      this.user = await this.userService.getMyUser()

      this.profileForm.reset({
        username: this.user.username,
        name: this.user.name ?? ""
      })
      this.emailForm.reset({
        email: this.user.email
      })
      this.passwordForm.reset()

      this.hasLoaded = true
    } catch (e) {
      // user just isn't logged in
      window.location.assign(oidcLoginPath(this.configService.getCurrentHost()))
    }
  }

  async updateProfile() {
    this.disablePage()
    try {
      if (!this.profileForm.value.username) {
        throw new Error("Username is required.")
      }

      await this.userService.updateProfile({
        username: this.profileForm.value.username,
        name: this.profileForm.value.name ?? undefined
      })
      this.snackbarService.show("Profile updated.")
    } catch (e) {
      this.snackbarService.error("Could not update profile.")
    } finally {
      await this.loadUser()
      this.enablePage()
    }
  }

  async updatePassword() {
    this.disablePage()
    try {
      const { oldPassword, newPassword } = this.passwordForm.value
      if (!oldPassword || !newPassword) {
        throw new Error("Password missing.")
      }

      await this.userService.updatePassword({
        oldPassword: oldPassword,
        newPassword: newPassword
      })
      this.snackbarService.show("Password updated.")
    } catch (e) {
      this.snackbarService.error("Could not update password.")
    } finally {
      await this.loadUser()
      this.enablePage()
    }
  }

  async updateEmail() {
    this.disablePage()
    try {
      const email = this.emailForm.value.email
      if (!email) {
        throw new Error("Email missing.")
      }
      await this.userService.updateEmail({
        email: email
      })
      // TODO: if email verification enabled, indicate that in message
      this.snackbarService.show("Email updated.") 
    } catch (e) {
      this.snackbarService.error("Could not update email.")
    } finally {
      await this.loadUser()
      this.enablePage()
    }
  }
}
