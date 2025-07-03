import { Component, inject, input } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { MaterialModule } from '../../material-module'
import { SnackbarService } from '../../services/snackbar.service'

@Component({
  selector: 'app-copy-field',
  imports: [
    MaterialModule,
    ReactiveFormsModule,
  ],
  templateUrl: './copy-field.component.html',
  styleUrl: './copy-field.component.scss',
})
export class CopyFieldComponent {
  label = input<string>()
  value = input<string>()

  snackbarService = inject(SnackbarService)
}
