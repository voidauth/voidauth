import { Component, inject } from '@angular/core'
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { MaterialModule } from '../../material-module'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'

@Component({
  selector: 'app-passkey-edit',
  imports: [
    MaterialModule,
    ReactiveFormsModule,
    ValidationErrorPipe,
  ],
  templateUrl: './passkey-edit.component.html',
  styleUrl: './passkey-edit.component.scss',
})
export class PasskeyEditDialog {
  readonly dialogRef = inject(MatDialogRef<PasskeyEditDialog>)
  readonly data = inject<{ id: string, displayName: string | null }>(MAT_DIALOG_DATA)
  displayNameControl = new FormControl<string | null>(this.data.displayName ?? null, [Validators.minLength(1)])
}
