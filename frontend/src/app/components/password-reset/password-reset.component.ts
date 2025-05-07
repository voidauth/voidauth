import { CommonModule } from '@angular/common'
import { Component, input, output } from '@angular/core'
import { FormsModule, ReactiveFormsModule, FormGroup } from '@angular/forms'
import { MaterialModule } from '../../material-module'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'
import type { TypedFormGroup } from '../../pages/admin/clients/upsert-client/upsert-client.component'
import type { UpdatePassword } from '@shared/api-request/UpdatePassword'
import { NewPasswordInputComponent } from '../new-password-input/new-password-input.component'

@Component({
  selector: 'app-password-reset',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    CommonModule,
    MaterialModule,
    ValidationErrorPipe,
    NewPasswordInputComponent,
  ],
  templateUrl: './password-reset.component.html',
  styleUrl: './password-reset.component.scss',
})
export class PasswordResetComponent {
  passwordForm = input.required<FormGroup<TypedFormGroup<UpdatePassword & { confirmPassword: string }>>>()
  submit = output()
  pwdShow: boolean = false
}
