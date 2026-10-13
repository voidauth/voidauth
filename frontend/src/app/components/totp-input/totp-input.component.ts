import { Component, computed, effect, inject, input,
  output, signal, type AfterViewInit, ChangeDetectionStrategy, type OnInit } from '@angular/core'
import { MaterialModule } from '../../material-module'
import { ReactiveFormsModule } from '@angular/forms'
import QRCode from 'qrcode'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { SnackbarService } from '../../services/snackbar.service'
import { HumanDurationPipe } from '../../pipes/HumanDurationPipe'
import { AsyncPipe } from '@angular/common'
import { UserService } from '../../services/user.service'
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'

@Component({
  selector: 'app-totp-input',
  imports: [MaterialModule, ReactiveFormsModule, TranslatePipe, HumanDurationPipe, AsyncPipe],
  templateUrl: './totp-input.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './totp-input.component.scss',
})
export class TotpInputComponent implements AfterViewInit, OnInit {
  snackbarService = inject(SnackbarService)
  private translateService = inject(TranslateService)
  private userService = inject(UserService)

  disabled = input<boolean>()
  lockoutUntil = input<Date | null>(null)
  uri = input<string>()
  secret = input<string>()
  user?: CurrentUserDetails

  qrcodeData: string | null = null

  codeFinished = output<string>()

  code = signal('')
  private clock = signal(Date.now())
  lockedCountdown = computed(() => {
    const until = this.lockoutUntil()
    return until ? Math.max(0, Math.ceil((until.getTime() - this.clock()))) : 0
  })

  constructor() {
    effect((onCleanup) => {
      const until = this.lockoutUntil()
      if (!until) {
        return
      }

      this.clock.set(Date.now())
      const timer = setInterval(() => {
        this.clock.set(Date.now())
      }, 500)
      onCleanup(() => {
        clearInterval(timer)
      })
    })

    effect(() => {
      const uri = this.uri()
      if (uri) {
        QRCode.toDataURL(uri, {
          margin: 1,
          width: 240 * 3,
        })
          .then((d) => {
            this.qrcodeData = d
          })
          .catch((e: unknown) => {
            console.error(e)
          })
      }
    })
  }

  async ngOnInit(): Promise<void> {
    try {
      this.user = await this.userService.getMyUser()
    } catch (_e) {
      // If user cannot be loaded, do nothing
    }
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
