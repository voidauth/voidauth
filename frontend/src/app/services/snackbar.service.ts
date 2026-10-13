import { inject, Injectable } from '@angular/core'
import { MatSnackBar } from '@angular/material/snack-bar'
import { TranslateService } from '@ngx-translate/core'

@Injectable({
  providedIn: 'root',
})
export class SnackbarService {
  private snackBar = inject(MatSnackBar)
  private translateService = inject(TranslateService)

  private messageDuration = 6
  private errorDuration = 15

  message(message: string) {
    this.snackBar.open(message, String(this.translateService.instant('components.snackbar.ok')), {
      duration: this.messageDuration * 1000,
    })
  }

  error(message: string) {
    this.snackBar.open(message, 'X', {
      duration: this.errorDuration * 1000,
      panelClass: 'error-snackbar',
    })
  }
}
