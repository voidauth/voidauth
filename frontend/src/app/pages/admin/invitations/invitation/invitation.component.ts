import { AsyncPipe, CommonModule } from '@angular/common'
import { Component, inject, ChangeDetectionStrategy, type OnInit } from '@angular/core'
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { CUSTOM_CLAIM_REGEX, PROTECTED_CLAIMS, USERNAME_REGEX } from '@shared/constants'
import { MaterialModule } from '../../../../material-module'
import { ValidationErrorPipe } from '../../../../pipes/ValidationErrorPipe'
import { AdminService } from '../../../../services/admin.service'
import { SnackbarService } from '../../../../services/snackbar.service'
import type { TypedControls } from '../../clients/upsert-client/upsert-client.component'
import type { InvitationUpsert } from '@shared/api-request/admin/InvitationUpsert'
import { ConfigService } from '../../../../services/config.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { SpinnerService } from '../../../../services/spinner.service'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../../../dialogs/confirm/confirm.component'
import { isValidEmail } from '../../../../validators/validators'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import type { AdminConfig } from '@shared/api-response/admin/AdminConfig'
import { stringCompare, type Convert, type ItemIn } from '@shared/utils'
import type { InvitationDetails } from '@shared/api-response/admin/InvitationDetails'
import { OptionValueDialogComponent, type OptionValueDialogData, type OptionValueResult }
  from '../../../../dialogs/option-value-dialog/option-value-dialog.component'
import { calculateCustomClaims } from '@shared/user'

@Component({
  selector: 'app-invitation',
  imports: [CommonModule, MaterialModule, ValidationErrorPipe, ReactiveFormsModule, AsyncPipe, TranslatePipe],
  templateUrl: './invitation.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './invitation.component.scss',
})
export class InvitationComponent implements OnInit {
  public id: string | null = null
  public config?: ConfigResponse
  public adminConfig?: AdminConfig

  public availableGroups: ItemIn<InvitationUpsert['groups']>[] = []
  public unselectedGroups: ItemIn<InvitationUpsert['groups']>[] = []
  public selectableGroups: ItemIn<InvitationUpsert['groups']>[] = []
  groupSelect = new FormControl<string>(
    {
      value: '',
      disabled: false,
    },
    [],
  )

  public inviteLink?: string
  public inviteEmail?: string | null

  public form = new FormGroup(
    {
      username: new FormControl<string | null>(null, [Validators.minLength(1), Validators.pattern(USERNAME_REGEX)]),
      email: new FormControl<string | null>(null, [isValidEmail]),
      name: new FormControl<string | null>(null, [Validators.minLength(1)]),
      userExpiresAt: new FormControl<Date | null>(null, []),
      emailVerified: new FormControl<boolean>({ value: true, disabled: true }, { nonNullable: true }),
      groups: new FormControl<InvitationDetails['groups']>([], { nonNullable: true }),
      customClaims: new FormControl<InvitationUpsert['customClaims']>([], { nonNullable: true }),
    },
    [
      (c) => {
        const f = c as FormGroup<TypedControls<Omit<InvitationUpsert, 'id'>>>
        if (!f.controls.email.value && !f.controls.username.value) {
          return { usernameOrEmail: 'Username or Email are required.' }
        }
        return null
      },
    ],
  )

  private adminService = inject(AdminService)
  private configService = inject(ConfigService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  public snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private dialog = inject(MatDialog)
  private translateService = inject(TranslateService)

  ngOnInit() {
    this.route.paramMap.subscribe(async (params) => {
      try {
        this.spinnerService.show()

        const id = params.get('id')

        this.config = await this.configService.getConfig()
        this.adminConfig = await this.adminService.config()
        this.availableGroups = (await this.adminService.groups())

        if (id) {
          // We are updating an invite
          this.id = id
          const invitation = await this.adminService.invitation(this.id)
          await this.formSet(invitation)
          this.setEmailVerifiedState()
        } else {
          // This is a new invite
          if (this.adminConfig.defaultUserExpireDuration) {
            const defaultExpireDate = new Date(Date.now() + this.adminConfig.defaultUserExpireDuration * 1000)
            this.form.controls.userExpiresAt.setValue(defaultExpireDate)
          }

          if (this.adminConfig.defaultGroups.length) {
            this.form.controls.groups.setValue(this.adminConfig.defaultGroups.sort((a, b) => stringCompare(a.name, b.name)))
            this.form.controls.groups.markAsDirty()
          }
        }

        this.groupAutoFilter()
      } catch (e) {
        console.error(e)
        this.snackbarService.error('Error loading invitation.')
      } finally {
        this.spinnerService.hide()
      }
    })

    this.form.controls.email.valueChanges.subscribe(() => {
      this.setEmailVerifiedState()
    })

    // Keeps the userExpiresAt datepicker and timepicker in sync
    this.form.controls.userExpiresAt.valueChanges.subscribe((value) => {
      this.form.controls.userExpiresAt.setValue(value, { emitEvent: false })
    })
  }

  async formSet(invitation: InvitationDetails) {
    this.form.reset({
      username: invitation.username ?? null,
      name: invitation.name ?? null,
      email: invitation.email ?? null,
      groups: invitation.groups,
      customClaims: invitation.customClaims,
      emailVerified: !!invitation.emailVerified,
      userExpiresAt: invitation.userExpiresAt ? new Date(invitation.userExpiresAt) : null,
    })
    this.inviteEmail = invitation.email
    if (!this.config) {
      this.config = await this.configService.getConfig()
    }
    this.inviteLink = this.adminService.getInviteLink(this.config.domain, invitation.id, invitation.challenge)
  }

  groupAutoFilter(value: string = '') {
    this.unselectedGroups = this.availableGroups.filter((g) => {
      return !this.form.controls.groups.value.some(f => f.name === g.name)
    })
    this.selectableGroups = this.unselectedGroups
      .filter((g) => {
        return g.name.toLowerCase().includes(value.toLowerCase())
      })
      .slice(0, 5)
    if (this.unselectedGroups.length) {
      this.groupSelect.enable()
    } else {
      this.groupSelect.disable()
    }
  }

  async addGroup(value: { id: string }) {
    // Get the group details first
    try {
      this.spinnerService.show()
      const groupDetails = (await this.adminService.group(value.id))
      const group = {
        id: groupDetails.id,
        name: groupDetails.name,
        customClaims: groupDetails.customClaims,
      } satisfies Convert<typeof groupDetails, ItemIn<typeof this.form.controls.groups.value>>
      this.form.controls.groups.setValue([group].concat(this.form.controls.groups.value).sort((a, b) => stringCompare(a.name, b.name)))
      this.form.controls.groups.markAsDirty()
      this.groupSelect.setValue(null)
      this.groupSelect.markAsUntouched()
      this.groupSelect.updateValueAndValidity()
      this.groupAutoFilter()
    } catch (e) {
      console.error(e)
      this.snackbarService.error('Error adding group.')
    } finally {
      this.spinnerService.hide()
    }
  }

  removeGroup(name: string) {
    this.form.controls.groups.setValue(this.form.controls.groups.value.filter(g => g.name !== name))
    this.form.controls.groups.markAsDirty()
    this.groupAutoFilter()
  }

  async addCustomClaim() {
    const availableCustomClaims = (await this.adminService.customClaims())
      .filter(c => !this.form.controls.customClaims.value.some(cc => cc.claim === c.claim)).map(c => c.claim)

    const dialogRef = this.dialog.open(OptionValueDialogComponent, {
      data: {
        header: 'Add Custom Claim',
        availableOptions: availableCustomClaims,
        allowNew: true,
        newRegex: CUSTOM_CLAIM_REGEX,
        newForbidden: [...PROTECTED_CLAIMS],
        optionLabel: 'Custom Claim',
      } satisfies OptionValueDialogData,
      disableClose: true,
    })

    dialogRef.afterClosed().subscribe((result: OptionValueResult) => {
      if (!result) {
        return
      }

      this.form.controls.customClaims.setValue([
        ...this.form.controls.customClaims.value,
        { claim: result.option, value: result.value },
      ].sort((a, b) => {
        return stringCompare(a.claim, b.claim)
      }))
      this.form.controls.customClaims.markAsDirty()
    })
  }

  async editCustomClaim(claimToEdit: ItemIn<InvitationUpsert['customClaims']>) {
    const availableCustomClaims = (await this.adminService.customClaims())
      .filter(c => !this.form.controls.customClaims.value.some(cc => cc.claim === c.claim)).map(c => c.claim)

    const dialogRef = this.dialog.open(OptionValueDialogComponent, {
      data: {
        header: 'Edit Custom Claim',
        availableOptions: availableCustomClaims,
        allowNew: true,
        newRegex: CUSTOM_CLAIM_REGEX,
        newForbidden: [...PROTECTED_CLAIMS],
        optionLabel: 'Custom Claim',
        currentOption: claimToEdit.claim,
        currentValue: claimToEdit.value,
      } satisfies OptionValueDialogData,
      disableClose: true,
    })

    dialogRef.afterClosed().subscribe((result: OptionValueResult) => {
      if (!result) {
        return
      }

      this.form.controls.customClaims.setValue(
        this.form.controls.customClaims.value.map((claim) => {
          return claim.claim === claimToEdit.claim ? { claim: result.option, value: result.value } : claim
        }),
      )
      this.form.controls.customClaims.markAsDirty()
    })
  }

  removeCustomClaim(removed: ItemIn<InvitationUpsert['customClaims']>) {
    const updated = this.form.controls.customClaims.value.filter(c => c.claim !== removed.claim)
    this.form.controls.customClaims.setValue(updated)
    this.form.controls.customClaims.markAsDirty()
  }

  // TODO: memoize this so it doesn't recalculate every time. Probably need signal forms first
  groupClaimsList() {
    const calcUserClaims = calculateCustomClaims({
      customClaims: this.form.controls.customClaims.value,
      groups: this.form.controls.groups.value,
    })
    type GroupClaimsInfo = { groupId: string, group: string, active: boolean, claim: string, value: string }
    const gc = this.form.controls.groups.value.reduce<GroupClaimsInfo[]>((acc, g) => {
      return acc.concat(
        g.customClaims.flatMap(c => ({
          groupId: g.id, group: g.name, active: calcUserClaims.some(cc => cc.claim === c.claim && cc.groupId === g.id), ...c,
        })))
    }, [])
    // active claims first, then by claim name
    return gc.sort((a, b) => a.active === b.active ? stringCompare(a.claim, b.claim) : a.active ? -1 : 1)
  }

  setEmailVerifiedState() {
    if (this.form.controls.email.value) {
      this.form.controls.emailVerified.enable()
    } else {
      this.form.controls.emailVerified.disable()
    }
  }

  onCopyInviteLink() {
    this.snackbarService.message(String(this.translateService.instant('admin.invitation.messages.link-copied')))
  }

  async sendEmail() {
    try {
      this.spinnerService.show()

      if (!this.id) {
        throw new Error('Invite ID missing.')
      }

      await this.adminService.sendInvitation(this.id)
      this.snackbarService.message(`Invite sent to ${String(this.inviteEmail)}.`)
    } catch (e) {
      console.error(e)
      this.snackbarService.error('Could not send invitation.')
    } finally {
      this.spinnerService.hide()
    }
  }

  async submit() {
    try {
      this.spinnerService.show()

      const values = this.form.getRawValue()

      const invitation = await this.adminService.upsertInvitation({
        ...values,
        id: this.id ?? undefined,
      })

      this.snackbarService.message(`Invitation ${this.id ? 'updated' : 'created'}.`)

      this.id = invitation.id
      await this.formSet(invitation)
      await this.router.navigate(['/admin/invitation', this.id], {
        replaceUrl: true,
      })
    } catch (e) {
      console.error(e)
      this.snackbarService.error(`Could not ${this.id ? 'update' : 'create'} invitation.`)
    } finally {
      this.spinnerService.hide()
    }
  }

  remove() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to delete this invitation?`,
        header: 'Delete',
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }
      try {
        this.spinnerService.show()

        if (this.id) {
          await this.adminService.deleteInvitation(this.id)
        }

        this.snackbarService.message('Invitation deleted.')
        await this.router.navigate(['/admin/invitations'])
      } catch (_e) {
        this.snackbarService.error('Could not delete invitation.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }
}
