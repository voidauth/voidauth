import { Component, inject, input } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { MaterialModule } from '../../material-module'
import { SnackbarService } from '../../services/snackbar.service'
import { TranslateService } from '@ngx-translate/core'

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
  private translateService = inject(TranslateService)

  onCopy() {
    this.snackbarService.message(String(this.translateService.instant('components.copy-field.messages.copied', { label: this.label() })))
  }
}
