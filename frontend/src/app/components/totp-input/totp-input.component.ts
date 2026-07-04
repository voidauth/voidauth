import { Component, effect, inject, input, output, signal, type AfterViewInit } from '@angular/core'
import { MaterialModule } from '../../material-module'
import { ReactiveFormsModule } from '@angular/forms'
import QRCode from 'qrcode'
import { TextDividerComponent } from '../text-divider/text-divider.component'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { SnackbarService } from '../../services/snackbar.service'

@Component({
  selector: 'app-totp-input',
  imports: [MaterialModule, ReactiveFormsModule, TextDividerComponent, TranslatePipe],
  templateUrl: './totp-input.component.html',
  styleUrl: './totp-input.component.scss',
})
export class TotpInputComponent implements AfterViewInit {
  snackbarService = inject(SnackbarService)
  private translateService = inject(TranslateService)

  disabled = input<boolean>()
  uri = input<string>()
  secret = input<string>()
  enableMfa = input<boolean>()

  qrcodeData: string | null = null

  codeFinished = output<string>()

  code = signal('')

  constructor() {
    effect(() => {
      const uri = this.uri()
      if (uri) {
        QRCode.toDataURL(uri, {
          margin: 1,
          width: 240 * 3,
        }).then((d) => {
          this.qrcodeData = d
        }).catch((e: unknown) => {
          console.error(e)
        })
      }
    })
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      const input = document.getElementById('totp_input') as HTMLInputElement | null
      input?.focus()
    }, 100)
  }

  checkFinished() {
    if (this.code().length === 6 && /^\d*$/.test(this.code())) {
      this.codeFinished.emit(this.code())
    }
  }

  onCodeInput(event: Event) {
    const input = event.target as HTMLInputElement
    const formattedValue = input.value.replace(/\D/g, '').slice(0, 6)

    input.value = formattedValue
    this.code.set(formattedValue)
    this.checkFinished()
  }

  onSecretCopy() {
    this.snackbarService.message(String(this.translateService.instant('components.totp-input.messages.copied-secret')))
  }
}
