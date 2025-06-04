import { inject, Injectable } from "@angular/core"
import { MatSnackBar } from "@angular/material/snack-bar"

@Injectable({
  providedIn: "root",
})
export class SnackbarService {
  private snackBar = inject(MatSnackBar)

  private messageDuration = 6
  private errorDuration = 30

  show(message: string) {
    this.snackBar.open(message, "Ok", {
      duration: this.messageDuration * 1000,
    })
  }

  error(message: string) {
    this.snackBar.open(message, "X", {
      duration: this.errorDuration * 1000,
      panelClass: "error-snackbar",
    })
  }
}
