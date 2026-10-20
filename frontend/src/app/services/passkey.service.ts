import { HttpClient } from '@angular/common/http'
import { Component, inject, Injectable, type OnInit, ChangeDetectionStrategy } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { firstValueFrom } from 'rxjs'
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  WebAuthnError,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import type { Redirect } from '@shared/api-response/Redirect'
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog'
import { SnackbarService } from './snackbar.service'
import { SpinnerService } from './spinner.service'
import { MaterialModule } from '../material-module'
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { PasskeyNameDialog } from '../dialogs/passkey-name/passkey-name.component'
import type { PasskeyRegisterResponse } from '@shared/api-response/PasskeyRegisterResponse'
import { AuthService } from './auth.service'

@Injectable({
  providedIn: 'root',
})
export class PasskeyService {
  private http = inject(HttpClient)
  private translateService = inject(TranslateService)
  private dialog = inject(MatDialog)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private authService = inject(AuthService)

  /**
   * Checks if passkey registration or usage has ever been flagged in localStorage.
   * Not a perfect solution, but until there is a method to check if a device passkey exists,
   * this will have to do. This is just a hint and should not disable any functionality.
   * @returns if there is passkey usage flagged in localStorage
   */
  localPasskeySeen() {
    return !!localStorage.getItem('passkey_seen')
  }

  localPasskeySkipped() {
    return !!localStorage.getItem('passkey_skipped')
  }

  resetPasskeySeen() {
    localStorage.removeItem('passkey_seen')
  }

  resetPasskeySkipped() {
    localStorage.removeItem('passkey_skipped')
  }

  getPasskeySupport(): PasskeySupport {
    if (!browserSupportsWebAuthn()) {
      return {
        enabled: false,
      }
    }

    return {
      enabled: true,
      platformName: undefined,
      platformIcon: undefined,
    }
  }

  private async getAuthOptions(requireVerified?: boolean) {
    return firstValueFrom(this.http.post<PublicKeyCredentialRequestOptionsJSON>('/api/interaction/passkey/start', { requireVerified }))
  }

  async updatePasskey(passkey_id: string, displayName: string) {
    return firstValueFrom(this.http.patch<null>(`/api/interaction/passkey/${passkey_id}`, { displayName }))
  }

  private async sendAuth(auth: AuthenticationResponseJSON, remember?: boolean, enableMfa?: boolean) {
    const result = firstValueFrom(
      this.http.post<Redirect | undefined>('/api/interaction/passkey/end', {
        ...auth,
        remember,
        enableMfa,
      }),
    )
    localStorage.setItem('passkey_seen', Date())
    return result
  }

  async login(opts: { remember?: boolean, requireVerified?: boolean, enableMfa?: boolean } = {}) {
    const { remember = false, requireVerified, enableMfa } = opts
    const optionsJSON = await this.getAuthOptions(requireVerified)
    const auth = await startAuthentication({ optionsJSON })
    return await this.sendAuth(auth, remember, enableMfa)
  }

  async register(opts: { requireVerified?: boolean, enableMfa?: boolean, skipPasskeyPrompt?: boolean } = {}) {
    const { requireVerified, enableMfa, skipPasskeyPrompt } = opts

    const options = await firstValueFrom(
      this.http.post<PublicKeyCredentialCreationOptionsJSON>('/api/interaction/passkey/registration/start', { requireVerified }),
    )
    const reg = await startRegistration({ optionsJSON: options })
    try {
      const result = await firstValueFrom(this.http.post<PasskeyRegisterResponse>('/api/interaction/passkey/registration/end', {
        ...reg,
        enableMfa,
      }))
      if (skipPasskeyPrompt !== undefined) {
        try {
          await this.savePasskeyPromptPreference(skipPasskeyPrompt)
        } catch {
          this.showPasskeyPromptPreferenceError()
        }
      }
      localStorage.setItem('passkey_seen', Date())

      await this.openNamingDialog(result.passkeyId)

      return result
    } catch (error) {
      // Check if error because passkey already exists
      if (error instanceof WebAuthnError && error.name === 'InvalidStateError') {
        localStorage.setItem('passkey_seen', Date())
      }
      throw error
    }
  }

  async openNamingDialog(passkeyId: string) {
    return new Promise<void>((resolve, _reject) => {
      this.spinnerService.hide()
      const nameDialogRef = this.dialog.open(PasskeyNameDialog, { disableClose: true })
      nameDialogRef.afterClosed().subscribe((displayName: string | null) => {
        if (displayName) {
          this.spinnerService.show()
          this.updatePasskey(passkeyId, displayName)
            .then(() => {
              this.snackbarService.message(String(this.translateService.instant('passkey-dialog.messages.added')))
            })
            .catch(() => {
              this.snackbarService.error(
                String(this.translateService.instant('passkey-dialog.messages.name-failed')),
              )
            })
            .finally(() => {
              this.spinnerService.hide()
              resolve()
            })
        } else {
          this.snackbarService.message(String(this.translateService.instant('passkey-dialog.messages.added')))
          resolve()
        }
      })
    })
  }

  shouldAskPasskey(user: Partial<Pick<CurrentUserDetails, 'canLogin' | 'hasPasskeys' | 'skipPasskeyPrompt'>>) {
    return (
      user.canLogin
      && this.getPasskeySupport().enabled
      && !user.skipPasskeyPrompt
      && !this.localPasskeySeen()
      && !this.localPasskeySkipped()
    )
  }

  async dialogRegistration(options: { skipPasskeyPrompt?: boolean, context?: PasskeyPromptContext } = {}): Promise<boolean> {
    const context = options.context ?? 'automatic'
    const result = await firstValueFrom(this.dialog.open<PasskeyDialog, PasskeyDialogData, PasskeyDialogResult>(PasskeyDialog, {
      disableClose: true,
      data: {
        skipPasskeyPrompt: options.skipPasskeyPrompt ?? false,
        context,
      },
    }).afterClosed())

    if (!result) {
      return false
    }

    if (result.action === 'skip') {
      if (context === 'automatic') {
        localStorage.setItem('passkey_skipped', Date())
      }
      this.spinnerService.show()
      try {
        await this.savePasskeyPromptPreference(result.skipPasskeyPrompt)
      } catch {
        this.showPasskeyPromptPreferenceError()
      } finally {
        this.spinnerService.hide()
      }
      return false
    }

    this.spinnerService.show()
    try {
      await this.register({ skipPasskeyPrompt: result.skipPasskeyPrompt })
      return true
    } catch (error: unknown) {
      if (error instanceof WebAuthnError && error.name === 'InvalidStateError') {
        this.snackbarService.error(String(this.translateService.instant('components.common.messages.passkey-already-registered')))
      } else {
        this.snackbarService.error(String(this.translateService.instant('passkey-dialog.messages.create-failed')))
      }
      return false
    } finally {
      this.spinnerService.hide()
    }
  }

  private async savePasskeyPromptPreference(skipPasskeyPrompt: boolean) {
    await this.authService.updatePasskeyPrompt({ skipPasskeyPrompt })
  }

  private showPasskeyPromptPreferenceError() {
    this.snackbarService.error(String(this.translateService.instant('passkey-dialog.messages.preference-failed')))
  }
}

export type PasskeySupport = {
  enabled: boolean
  platformName?: 'Face ID' | 'Touch ID'
  platformIcon?: string
}

type PasskeyPromptContext = 'manual' | 'automatic'

type PasskeyDialogData = {
  skipPasskeyPrompt: boolean
  context: PasskeyPromptContext
}

type PasskeyDialogResult = {
  skipPasskeyPrompt: boolean
  action: 'skip' | 'register'
}

@Component({
  selector: 'app-passkey-dialog',
  imports: [MaterialModule, ReactiveFormsModule, TranslatePipe],
  template: `
    <h1 mat-dialog-title>
      {{ "passkey-dialog.title" | translate: { platformName: passkeySupport?.platformName ?? ("passkey-title" | translate) } }}
    </h1>
    <mat-dialog-content style="min-height: 200px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 16px;">
      <mat-icon align="center" style="width: 100px; height: 100px; font-size: 100px;" fontSet="material-icons-round" matSuffix>{{
        passkeySupport?.platformIcon ?? "key"
      }}</mat-icon>
      <mat-checkbox [formControl]="skipPasskeyPrompt">{{ "passkey-dialog.actions.never-ask" | translate }}</mat-checkbox>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" (click)="close('skip')">
        {{ "passkey-dialog.actions.skip" | translate }}
      </button>
      <button mat-flat-button type="button" (click)="close('register')" cdkFocusInitial>
        {{ "passkey-dialog.actions.passkey" | translate: { platformName: passkeySupport?.platformName ?? ("passkey-title" | translate) } }}
        <mat-icon fontSet="material-icons-round" matSuffix>key</mat-icon>
      </button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: ``,
})
class PasskeyDialog implements OnInit {
  private passkeyService = inject(PasskeyService)
  private data = inject<PasskeyDialogData>(MAT_DIALOG_DATA)
  private dialogRef = inject<MatDialogRef<PasskeyDialog, PasskeyDialogResult>>(MatDialogRef)
  skipPasskeyPrompt = new FormControl(this.data.skipPasskeyPrompt, { nonNullable: true })
  passkeySupport?: PasskeySupport

  close(action: PasskeyDialogResult['action']) {
    this.dialogRef.close({ action, skipPasskeyPrompt: this.skipPasskeyPrompt.value })
  }

  ngOnInit() {
    this.passkeySupport = this.passkeyService.getPasskeySupport()
  }
}
