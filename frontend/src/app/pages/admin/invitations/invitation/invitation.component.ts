import { AsyncPipe, CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms'
import type { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'
import { ActivatedRoute, Router } from '@angular/router'
import { USERNAME_REGEX } from '@shared/constants'
import { MaterialModule } from '../../../../material-module'
import { ValidationErrorPipe } from '../../../../pipes/ValidationErrorPipe'
import { AdminService } from '../../../../services/admin.service'
import { SnackbarService } from '../../../../services/snackbar.service'
import type { TypedControls } from '../../clients/upsert-client/upsert-client.component'
import type { InvitationUpsert } from '@shared/api-request/admin/InvitationUpsert'
import type { InvitationDetails } from '@shared/api-response/InvitationDetails'
import { ConfigService } from '../../../../services/config.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { SpinnerService } from '../../../../services/spinner.service'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../../../dialogs/confirm/confirm.component'
import { isValidEmail } from '../../../../validators/validators'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import type { AdminConfig } from '@shared/api-response/admin/AdminConfig'

@Component({
  selector: 'app-invitation',
  imports: [
    CommonModule,
    MaterialModule,
    ValidationErrorPipe,
    ReactiveFormsModule,
    AsyncPipe,
    TranslatePipe,
  ],
  templateUrl: './invitation.component.html',
  styleUrl: './invitation.component.scss',
})
export class InvitationComponent {
  public id: string | null = null
  public config?: ConfigResponse
  public adminConfig?: AdminConfig

  public groups: string[] = []
  public unselectedGroups: string[] = []
  public selectableGroups: string[] = []
  groupSelect = new FormControl<string>({
    value: '',
    disabled: false,
  }, [])

  public inviteLink?: string
  public inviteEmail?: string | null

  public form = new FormGroup({
    username: new FormControl<string | null>(null, [Validators.minLength(1), Validators.pattern(USERNAME_REGEX)]),
    email: new FormControl<string | null>(null, [isValidEmail]),
    name: new FormControl<string | null>(null, [Validators.minLength(1)]),
    userExpiresAt: new FormControl<Date | null>(null, []),
    emailVerified: new FormControl<boolean>({ value: true, disabled: true }, { nonNullable: true }),
    groups: new FormControl<string[]>([], { nonNullable: true }),
  }, [(c) => {
    const f = c as FormGroup<TypedControls<Omit<InvitationUpsert, 'id'>>>
    if (!f.controls.email.value && !f.controls.username.value) {
      return { usernameOrEmail: 'Username or Email are required.' }
    }
    return null
  }]) satisfies FormGroup<TypedControls<Omit<InvitationUpsert, 'id'>>>

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
        this.groups = (await this.adminService.groups()).map(g => g.name)

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
            this.form.controls.groups.setValue(this.adminConfig.defaultGroups.sort())
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
      emailVerified: !!invitation.emailVerified,
      userExpiresAt: invitation.userExpiresAt
        ? new Date(invitation.userExpiresAt)
        : null,
    })
    this.inviteEmail = invitation.email
    if (!this.config) {
      this.config = await this.configService.getConfig()
    }
    this.inviteLink = this.adminService.getInviteLink(this.config.domain, invitation.id, invitation.challenge)
  }

  groupAutoFilter(value: string = '') {
    this.unselectedGroups = this.groups.filter((g) => {
      return !this.form.controls.groups.value.includes(g)
    })
    this.selectableGroups = this.unselectedGroups.filter((g) => {
      return g.toLowerCase().includes(value.toLowerCase())
    }).slice(0, 5)
    if (this.unselectedGroups.length) {
      this.groupSelect.enable()
    } else {
      this.groupSelect.disable()
    }
  }

  addGroup(event: MatAutocompleteSelectedEvent) {
    const value = event.option.value as string
    if (!value) {
      return
    }
    this.form.controls.groups.setValue([value].concat(this.form.controls.groups.value).sort())
    this.form.controls.groups.markAsDirty()
    this.groupSelect.setValue(null)
    this.groupAutoFilter()
  }

  removeGroup(value: string) {
    this.form.controls.groups.setValue((this.form.controls.groups.value).filter(g => g !== value))
    this.form.controls.groups.markAsDirty()
    this.groupAutoFilter()
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
