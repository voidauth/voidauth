import { Component, input } from '@angular/core'
import { ReactiveFormsModule, FormControl } from '@angular/forms'
import { MaterialModule } from '../../material-module'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'
import { NewPasswordInputComponent } from '../new-password-input/new-password-input.component'
import { AsyncPipe } from '@angular/common'

@Component({
  selector: 'app-password-set',
  imports: [
    ReactiveFormsModule,
    MaterialModule,
    ValidationErrorPipe,
    NewPasswordInputComponent,
    AsyncPipe,
  ],
  templateUrl: './password-set.component.html',
  styleUrl: './password-set.component.scss',
})
export class PasswordSetComponent {
  oldPassword = input<FormControl<string | null>>()
  newPassword = input.required<FormControl<string | null>>()
  confirmPassword = input.required<FormControl<string | null>>()

  pwdShow: boolean = false
}
