import { Component, inject } from '@angular/core'
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatDialogRef } from '@angular/material/dialog'
import { MaterialModule } from '../../material-module'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'
import { TranslatePipe } from '@ngx-translate/core'
import { UAParser } from 'ua-parser-js'
import { PasskeyService } from '../../services/passkey.service'

@Component({
  selector: 'app-passkey-name',
  imports: [
    MaterialModule,
    ReactiveFormsModule,
    ValidationErrorPipe,
    TranslatePipe,
  ],
  templateUrl: './passkey-name.component.html',
  styleUrls: ['./passkey-name.component.scss'],
})
export class PasskeyNameDialog {
  readonly dialogRef = inject(MatDialogRef<PasskeyNameDialog>)

  displayNameControl = new FormControl<string | null>(
    PasskeyNameDialog.getSuggested(),
    [Validators.minLength(1), Validators.maxLength(64)],
  )

  private static getSuggested(): string | null {
    try {
      const res = UAParser(navigator.userAgent)
      const os = res.os.name ?? ''

      const passkeyPlatformName = PasskeyService.getPlatform(os)?.platformName ?? ''

      const label = [os, passkeyPlatformName].filter(l => !!l).join(' - ')

      const suggested = label || null
      return (suggested && suggested.length > 64) ? suggested.slice(0, 61) + '...' : suggested
    } catch (_e) {
      return null
    }
  }
}
