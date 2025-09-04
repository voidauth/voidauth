import { Component, inject } from '@angular/core'
import { MaterialModule } from '../../material-module'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { FormControl, ReactiveFormsModule } from '@angular/forms'

@Component({
  selector: 'app-confirm',
  imports: [
    MaterialModule,
    ReactiveFormsModule,
  ],
  templateUrl: './confirm.component.html',
  styleUrl: './confirm.component.scss',
})
export class ConfirmComponent {
  readonly dialogRef = inject(MatDialogRef<ConfirmComponent>)
  readonly data = inject<{ message: string, header?: string, requiredText?: string }>(MAT_DIALOG_DATA)
  requiredTextControl = new FormControl<string | null>(null)
}
