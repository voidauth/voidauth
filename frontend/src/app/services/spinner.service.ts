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
    this.checkStatus()
  }

  hide() {
    setTimeout(() => {
      this.count--
      this.checkStatus()
    }, 500)
  }

  private checkStatus() {
    if (this.count > 0) {
      void this.ngxSpinnerService.show()
    } else {
      void this.ngxSpinnerService.hide()
    }
  }
}
