import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms'
import type { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'
import { ActivatedRoute, Router } from '@angular/router'
import { USERNAME_REGEX } from '@shared/constants'
import { MaterialModule } from '../../../../material-module'
import { ValidationErrorPipe } from '../../../../pipes/ValidationErrorPipe'
import { AdminService } from '../../../../services/admin.service'
import { SnackbarService } from '../../../../services/snackbar.service'
import type { TypedFormGroup } from '../../clients/upsert-client/upsert-client.component'
import type { InvitationUpsert } from '@shared/api-request/admin/InvitationUpsert'
import type { InvitationDetails } from '@shared/api-response/InvitationDetails'
import { ConfigService } from '../../../../services/config.service'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { emptyOrMinLength } from '../../../../validators/validators'

@Component({
  selector: 'app-invitation',
  imports: [
    CommonModule,
    MaterialModule,
    ValidationErrorPipe,
    ReactiveFormsModule,
  ],
  templateUrl: './invitation.component.html',
  styleUrl: './invitation.component.scss',
})
export class InvitationComponent {
  public id: string | null = null
  public hasLoaded = false
  public config?: ConfigResponse

  public groups: string[] = []
  public unselectedGroups: string[] = []
  public selectableGroups: string[] = []
  groupSelect = new FormControl<string>({
    value: '',
    disabled: false,
  }, [])

  public inviteLink?: string
  public inviteEmail?: string | null

  public form = new FormGroup<TypedFormGroup<Omit<InvitationUpsert, 'id'>>>({
    username: new FormControl<string | null>({
      value: null,
      disabled: false,
    }, [Validators.minLength(4), Validators.pattern(USERNAME_REGEX)]),
    email: new FormControl<string | null>({
      value: null,
      disabled: false,
    }, [Validators.email]),
    name: new FormControl<string | null>({
      value: null,
      disabled: false,
    }, [emptyOrMinLength(4)]),
    groups: new FormControl<string[]>({
      value: [],
      disabled: false,
    }, []),
  }, [(c) => {
    const f = c as FormGroup<TypedFormGroup<Omit<InvitationUpsert, 'id'>>>
    if (!f.controls.email.value && !f.controls.username.value) {
      return { usernameOrEmail: 'Username or Email are required.' }
    }
    return null
  }])

  private adminService = inject(AdminService)
  private configService = inject(ConfigService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  public snackbarService = inject(SnackbarService)

  ngOnInit() {
    this.disablePage()

    this.route.paramMap.subscribe(async (params) => {
      try {
        const id = params.get('id')

        this.config = await this.configService.getConfig()

        if (id) {
          this.id = id
          const invitation = await this.adminService.invitation(this.id)
          this.formSet(invitation)
        }

        this.groups = (await this.adminService.groups()).map(g => g.name)
        this.groupAutoFilter()

        this.enablePage()
        this.hasLoaded = true
      } catch (e) {
        console.error(e)
        this.snackbarService.error('Error loading invitation.')
      }
    })
  }

  formSet(invitation: InvitationDetails) {
    this.form.reset({
      username: invitation.username ?? null,
      name: invitation.name ?? null,
      email: invitation.email ?? null,
      groups: invitation.groups,
    })
    this.inviteEmail = invitation.email
    this.inviteLink = this.adminService.getInviteLink(invitation.id, invitation.challenge)
  }

  disablePage() {
    this.form.disable()
    this.groupSelect.disable()
  }

  enablePage() {
    this.form.enable()
    if (this.unselectedGroups.length) {
      this.groupSelect.enable()
    } else {
      this.groupSelect.disable()
    }
  }

  groupAutoFilter(value: string = '') {
    this.unselectedGroups = this.groups.filter((g) => {
      return !this.form.controls.groups.value?.includes(g)
    })
    this.selectableGroups = this.unselectedGroups.filter((g) => {
      return g.toLowerCase().includes(value.toLowerCase())
    })
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
    this.form.controls.groups.setValue([value].concat(this.form.controls.groups.value ?? []).sort())
    this.form.controls.groups.markAsDirty()
    this.groupSelect.setValue(null)
    this.groupAutoFilter()
  }

  removeGroup(value: string) {
    this.form.controls.groups.setValue((this.form.controls.groups.value ?? []).filter(g => g !== value))
    this.form.controls.groups.markAsDirty()
    this.groupAutoFilter()
  }

  async sendEmail() {
    try {
      if (!this.id) {
        throw new Error('Invite ID missing.')
      }

      await this.adminService.sendInvitation(this.id)
      this.snackbarService.show(`Invite sent to ${String(this.inviteEmail)}.`)
    } catch (e) {
      console.error(e)
      this.snackbarService.error(`Could not send invitation.`)
    }
  }

  async submit() {
    try {
      this.disablePage()

      const invitation = await this.adminService.upsertInvitation({ ...this.form.getRawValue(), id: this.id })

      this.snackbarService.show(`Invitation ${this.id ? 'updated' : 'created'}.`)

      this.id = invitation.id
      this.formSet(invitation)
      await this.router.navigate(['/admin/invitation', this.id], {
        replaceUrl: true,
      })
    } catch (e) {
      console.error(e)
      this.snackbarService.error(`Could not ${this.id ? 'update' : 'create'} invitation.`)
    } finally {
      this.enablePage()
    }
  }

  async remove() {
    try {
      this.disablePage()

      if (this.id) {
        await this.adminService.deleteInvitation(this.id)
      }

      this.snackbarService.show(`Invitation deleted.`)
      await this.router.navigate(['/admin/invitations'])
    } catch (_e) {
      this.snackbarService.error(`Could not delete invitation.`)
    } finally {
      this.enablePage()
    }
  }
}
