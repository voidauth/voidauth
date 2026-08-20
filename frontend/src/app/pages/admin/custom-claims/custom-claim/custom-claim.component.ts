import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { ConfirmComponent } from '../../../../dialogs/confirm/confirm.component'
import { MaterialModule } from '../../../../material-module'
import { AdminService } from '../../../../services/admin.service'
import { SnackbarService } from '../../../../services/snackbar.service'
import { SpinnerService } from '../../../../services/spinner.service'
import { ValidationErrorPipe } from '../../../../pipes/ValidationErrorPipe'
import { CUSTOM_CLAIM_REGEX } from '@shared/constants'
import type { CustomClaimDetails } from '@shared/api-response/admin/CustomClaimDetails'
import { stringCompare, type ItemIn } from '@shared/utils'
import { OptionValueDialogComponent,
  type OptionValueDialogData,
  type OptionValueResult } from '../../../../dialogs/option-value-dialog/option-value-dialog.component'

@Component({
  selector: 'app-custom-claim',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, ValidationErrorPipe, TranslatePipe],
  templateUrl: './custom-claim.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './custom-claim.component.scss',
})
export class CustomClaimComponent implements OnInit {
  public id: string | null = null

  public form = new FormGroup({
    claim: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(CUSTOM_CLAIM_REGEX)],
    }),
    users: new FormControl<CustomClaimDetails['users']>([], { nonNullable: true }),
    groups: new FormControl<CustomClaimDetails['groups']>([], { nonNullable: true }),
    invitations: new FormControl<CustomClaimDetails['invitations']>([], { nonNullable: true }),
  })

  private adminService = inject(AdminService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private dialog = inject(MatDialog)

  ngOnInit() {
    this.route.paramMap.subscribe(async (params) => {
      try {
        this.spinnerService.show()
        const id = params.get('id')

        if (id) {
          this.id = id
          const claim = await this.adminService.customClaim(this.id)
          this.form.reset({
            claim: claim.claim,
            users: claim.users,
            groups: claim.groups,
            invitations: claim.invitations,
          })
        }
      } catch (e) {
        console.error(e)
        this.snackbarService.error('Error loading custom claim.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }

  async addUserClaim() {
    const availableUsers = (await this.adminService.users())
      .filter(u => !this.form.controls.users.value.some(ccu => ccu.username === u.username))

    const dialogRef = this.dialog.open(OptionValueDialogComponent, {
      data: {
        header: 'Add User Claim',
        availableOptions: availableUsers.map(u => u.username),
        allowNew: false,
        optionLabel: 'User',
      } satisfies OptionValueDialogData,
      disableClose: true,
    })

    dialogRef.afterClosed().subscribe((result: OptionValueResult) => {
      if (!result) {
        return
      }

      const selectedUser = availableUsers.find(u => u.username === result.option)

      if (!selectedUser) {
        return
      }

      this.form.controls.users.setValue([
        ...this.form.controls.users.value,
        { id: selectedUser.id, username: selectedUser.username, value: result.value },
      ].sort((a, b) => {
        return stringCompare(a.username, b.username)
      }))
      this.form.controls.users.markAsDirty()
    })
  }

  async editUserClaim(userToEdit: ItemIn<CustomClaimDetails['users']>) {
    const availableUsers = (await this.adminService.users())
      .filter(u => !this.form.controls.users.value.some(ccu => ccu.username === u.username))

    const dialogRef = this.dialog.open(OptionValueDialogComponent, {
      data: {
        header: 'Edit User Claim',
        availableOptions: availableUsers.map(u => u.username),
        allowNew: false,
        optionLabel: 'User',
        currentOption: userToEdit.username,
        currentValue: userToEdit.value,
      } satisfies OptionValueDialogData,
      disableClose: true,
    })

    dialogRef.afterClosed().subscribe((result: OptionValueResult) => {
      if (!result) {
        return
      }

      this.form.controls.users.setValue(
        this.form.controls.users.value.map((u) => {
          return u === userToEdit ? { id: userToEdit.id, username: userToEdit.username, value: result.value } : u
        }),
      )
      this.form.controls.users.markAsDirty()
    })
  }

  removeUserClaim(removed: ItemIn<CustomClaimDetails['users']>) {
    const updated = this.form.controls.users.value.filter(u => u.id !== removed.id)
    this.form.controls.users.setValue(updated)
    this.form.controls.users.markAsDirty()
  }

  async addGroupClaim() {
    const availableGroups = (await this.adminService.groups())
      .filter(g => !this.form.controls.groups.value.some(ccg => ccg.name === g.name))

    const dialogRef = this.dialog.open(OptionValueDialogComponent, {
      data: {
        header: 'Add Group Claim',
        availableOptions: availableGroups.map(g => g.name),
        allowNew: false,
        optionLabel: 'Group',
      } satisfies OptionValueDialogData,
      disableClose: true,
    })

    dialogRef.afterClosed().subscribe((result: OptionValueResult) => {
      if (!result) {
        return
      }

      const selectedGroup = availableGroups.find(g => g.name === result.option)

      if (!selectedGroup) {
        return
      }

      this.form.controls.groups.setValue([
        ...this.form.controls.groups.value,
        { id: selectedGroup.id, name: selectedGroup.name, value: result.value },
      ].sort((a, b) => {
        return stringCompare(a.name, b.name)
      }))
      this.form.controls.groups.markAsDirty()
    })
  }

  async editGroupClaim(groupToEdit: ItemIn<CustomClaimDetails['groups']>) {
    const availableGroups = (await this.adminService.groups())
      .filter(g => !this.form.controls.groups.value.some(ccg => ccg.name === g.name))

    const dialogRef = this.dialog.open(OptionValueDialogComponent, {
      data: {
        header: 'Edit Group Claim',
        availableOptions: availableGroups.map(g => g.name),
        allowNew: false,
        optionLabel: 'Group',
        currentOption: groupToEdit.name,
        currentValue: groupToEdit.value,
      } satisfies OptionValueDialogData,
      disableClose: true,
    })

    dialogRef.afterClosed().subscribe((result: OptionValueResult) => {
      if (!result) {
        return
      }

      this.form.controls.groups.setValue(
        this.form.controls.groups.value.map((g) => {
          return g === groupToEdit ? { id: groupToEdit.id, name: groupToEdit.name, value: result.value } : g
        }),
      )
      this.form.controls.groups.markAsDirty()
    })
  }

  removeGroupClaim(removed: ItemIn<CustomClaimDetails['groups']>) {
    const updated = this.form.controls.groups.value.filter(g => g.id !== removed.id)
    this.form.controls.groups.setValue(updated)
    this.form.controls.groups.markAsDirty()
  }

  inviteDisplay(invite: { username?: string | null, email?: string | null }): string {
    return invite.username ?? invite.email ?? '-'
  }

  async addInviteClaim() {
    const availableInvites = (await this.adminService.invitations())
      .filter(n => !this.form.controls.invitations.value.some(ccn => ccn.id === n.id))

    const dialogRef = this.dialog.open(OptionValueDialogComponent, {
      data: {
        header: 'Add Invite Claim',
        availableOptions: availableInvites.map(n => this.inviteDisplay(n)),
        allowNew: false,
        optionLabel: 'Invite',
      } satisfies OptionValueDialogData,
      disableClose: true,
    })

    dialogRef.afterClosed().subscribe((result: OptionValueResult) => {
      if (!result) {
        return
      }

      const selectedInvite = availableInvites.find(n => this.inviteDisplay(n) === result.option)

      if (!selectedInvite) {
        return
      }

      this.form.controls.invitations.setValue([
        ...this.form.controls.invitations.value,
        { id: selectedInvite.id, username: selectedInvite.username, email: selectedInvite.email, value: result.value },
      ].sort((a, b) => {
        return stringCompare(this.inviteDisplay(a), this.inviteDisplay(b))
      }))
      this.form.controls.invitations.markAsDirty()
    })
  }

  async editInviteClaim(inviteToEdit: ItemIn<CustomClaimDetails['invitations']>) {
    const availableInvites = (await this.adminService.invitations())
      .filter(n => !this.form.controls.invitations.value.some(ccn => ccn.id === n.id))

    const dialogRef = this.dialog.open(OptionValueDialogComponent, {
      data: {
        header: 'Edit Invite Claim',
        availableOptions: availableInvites.map(n => this.inviteDisplay(n)),
        allowNew: false,
        optionLabel: 'Invitation',
        currentOption: this.inviteDisplay(inviteToEdit),
        currentValue: inviteToEdit.value,
      } satisfies OptionValueDialogData,
      disableClose: true,
    })

    dialogRef.afterClosed().subscribe((result: OptionValueResult) => {
      if (!result) {
        return
      }

      this.form.controls.invitations.setValue(
        this.form.controls.invitations.value.map((n) => {
          return n === inviteToEdit
            ? {
                id: inviteToEdit.id, username: inviteToEdit.username, email: inviteToEdit.email, value: result.value,
              }
            : n
        }),
      )
      this.form.controls.invitations.markAsDirty()
    })
  }

  removeInviteClaim(removed: ItemIn<CustomClaimDetails['invitations']>) {
    const updated = this.form.controls.invitations.value.filter(n => n.id !== removed.id)
    this.form.controls.invitations.setValue(updated)
    this.form.controls.invitations.markAsDirty()
  }

  async submit() {
    try {
      const values = this.form.getRawValue()

      this.spinnerService.show()
      const response = await this.adminService.upsertCustomClaim({
        id: this.id ?? undefined,
        ...values,
      })
      this.snackbarService.message(`Custom claim ${this.id ? 'updated' : 'created'}.`)

      this.form.markAsUntouched()
      this.form.markAsPristine()

      this.id = response.id
      await this.router.navigate(['/admin/claim', this.id], {
        replaceUrl: true,
      })
    } catch (_e) {
      this.snackbarService.error(`Could not ${this.id ? 'update' : 'create'} custom claim.`)
    } finally {
      this.spinnerService.hide()
    }
  }

  remove() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: 'Are you sure you want to delete this custom claim?',
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
          await this.adminService.deleteCustomClaim(this.id)
        }

        this.snackbarService.message('Custom claim deleted.')
        await this.router.navigate(['/admin/claims'])
      } catch (_e) {
        this.snackbarService.error('Could not delete custom claim.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }
}
