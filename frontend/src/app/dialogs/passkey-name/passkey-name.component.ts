import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatDialogRef } from '@angular/material/dialog'
import { MaterialModule } from '../../material-module'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'
import { TranslatePipe } from '@ngx-translate/core'
import { UAParser } from 'ua-parser-js'

@Component({
  selector: 'app-passkey-name',
  imports: [MaterialModule, ReactiveFormsModule, ValidationErrorPipe, TranslatePipe],
  templateUrl: './passkey-name.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./passkey-name.component.scss'],
})
export class PasskeyNameDialog {
  readonly dialogRef = inject(MatDialogRef<PasskeyNameDialog>)

  displayNameControl = new FormControl<string | null>(PasskeyNameDialog.getSuggested(), [
    Validators.minLength(1),
    Validators.maxLength(64),
  ])

  private static getSuggested(): string | null {
    try {
      const res = UAParser(navigator.userAgent)
      const os = res.os.name ?? ''

      // Date as year-month-day
      const now = new Date()
      const formattedDate = `${now.getFullYear().toString()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`

      const label = [os, formattedDate].filter(Boolean).join(' - ')

      const suggested = label || null
      return suggested && suggested.length > 64 ? suggested.slice(0, 61) + '...' : suggested
    } catch (_e) {
      return null
    }
  }
}
