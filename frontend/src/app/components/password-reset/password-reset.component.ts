import { CommonModule } from "@angular/common"
import { Component, input } from "@angular/core"
import { ReactiveFormsModule, FormControl } from "@angular/forms"
import { MaterialModule } from "../../material-module"
import { ValidationErrorPipe } from "../../pipes/ValidationErrorPipe"
import { NewPasswordInputComponent } from "../new-password-input/new-password-input.component"

@Component({
  selector: "app-password-reset",
  imports: [
    ReactiveFormsModule,
    CommonModule,
    MaterialModule,
    ValidationErrorPipe,
    NewPasswordInputComponent,
  ],
  templateUrl: "./password-reset.component.html",
  styleUrl: "./password-reset.component.scss",
})
export class PasswordResetComponent {
  oldPassword = input<FormControl<string | null>>()
  newPassword = input.required<FormControl<string | null>>()
  confirmPassword = input.required<FormControl<string | null>>()

  pwdShow: boolean = false
}
