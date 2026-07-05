import { inject, Injectable } from '@angular/core'
import { NgxSpinnerService } from 'ngx-spinner'

@Injectable({
  providedIn: 'root',
})
export class SpinnerService {
  private ngxSpinnerService = inject(NgxSpinnerService)

  private count = 0
  private showTimeout?: ReturnType<typeof setTimeout>
  private hideTimeout?: ReturnType<typeof setTimeout>

  show(immediate: boolean = false) {
    this.count = this.count + 1
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = undefined
    }
    if (this.showTimeout) {
      clearTimeout(this.showTimeout)
    }
    this.showTimeout = setTimeout(() => {
      this.showTimeout = undefined
      this.checkStatusShow()
    }, immediate ? 0 : 500) // Do not show the spinner if the operation is very fast
  }

  hide() {
    this.count = Math.max(this.count - 1, 0)
    if (this.showTimeout) {
      clearTimeout(this.showTimeout)
      this.showTimeout = undefined
    }
    if (this.count <= 0) {
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout)
      }
      this.hideTimeout = setTimeout(() => {
        this.hideTimeout = undefined
        this.checkStatusHide()
      }, 2000) // Keep the spinner visible for a bit to avoid flickering
    }
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
