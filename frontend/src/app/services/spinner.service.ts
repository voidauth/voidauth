import { inject, Injectable } from '@angular/core'
import { NgxSpinnerService } from 'ngx-spinner'

@Injectable({
  providedIn: 'root',
})
export class SpinnerService {
  private ngxSpinnerService = inject(NgxSpinnerService)

  private count = 0

  show() {
    this.count++
    setTimeout(() => {
      this.checkStatusShow()
    }, 500) // Do not show the spinner if the operation is very fast
  }

  hide() {
    this.count--
    setTimeout(() => {
      this.checkStatusHide()
    }, 2000) // Keep the spinner visible for a bit to avoid flickering
  }

  private checkStatusShow() {
    if (this.count > 0) {
      void this.ngxSpinnerService.show()
    }
  }

  private checkStatusHide() {
    if (this.count <= 0) {
      void this.ngxSpinnerService.hide()
    }
  }
}
