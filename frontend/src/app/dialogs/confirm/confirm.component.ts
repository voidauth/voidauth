import { Component, inject } from '@angular/core'
import { MaterialModule } from '../../material-module'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'

@Component({
  selector: 'app-confirm',
  imports: [
    MaterialModule,
  ],
  templateUrl: './confirm.component.html',
  styleUrl: './confirm.component.scss',
})
export class ConfirmComponent {
  readonly dialogRef = inject(MatDialogRef<ConfirmComponent>)
  readonly data = inject<{ message: string, header?: string }>(MAT_DIALOG_DATA)
}
