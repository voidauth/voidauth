import { Component, inject } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { MaterialModule } from '../../material-module'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'
import { isValidEmail } from '../../validators/validators'
import { AsyncPipe } from '@angular/common'

@Component({
  selector: 'app-email-input',
  imports: [
    MaterialModule,
    ReactiveFormsModule,
    ValidationErrorPipe,
    AsyncPipe,
  ],
  templateUrl: './email-input.component.html',
  styleUrl: './email-input.component.scss',
})
export class EmailInputComponent {
  readonly dialogRef = inject(MatDialogRef<EmailInputComponent>)
  readonly data = inject<{ message?: string, header?: string, initial?: string }>(MAT_DIALOG_DATA)
  emailControl = new FormControl<string | null>(this.data.initial ?? null, [isValidEmail])
}
