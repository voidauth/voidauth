import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { MaterialModule } from '../../../../material-module'
import { ValidationErrorPipe } from '../../../../pipes/ValidationErrorPipe'
import { AdminService } from '../../../../services/admin.service'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { SnackbarService } from '../../../../services/snackbar.service'
import type { TypedControls } from '../../clients/upsert-client/upsert-client.component'
import type { GroupUpsert } from '@shared/api-request/admin/GroupUpsert'
import type { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'
import type { UserWithoutPassword } from '@shared/api-response/UserDetails'
import type { GroupUsers } from '@shared/api-response/admin/GroupUsers'
import { ADMIN_GROUP } from '@shared/constants'
import { SpinnerService } from '../../../../services/spinner.service'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../../../dialogs/confirm/confirm.component'

@Component({
  selector: 'app-group',
  imports: [
    CommonModule,
    MaterialModule,
    ValidationErrorPipe,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './group.component.html',
  styleUrl: './group.component.scss',
})
export class GroupComponent {
  ADMIN_GROUP = ADMIN_GROUP

  public id: string | null = null

  public users: UserWithoutPassword[] = []
  public unselectedUsers: UserWithoutPassword[] = []
  public selectableUsers: UserWithoutPassword[] = []
  userSelect = new FormControl<UserWithoutPassword | null>(null)

  public form = new FormGroup<TypedControls<Omit<GroupUpsert, 'id'>>>({
    name: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required, Validators.pattern('^[A-Za-z0-9_-]+$')]), // only alphanumeric, underscore, and hyphen
    users: new FormControl<GroupUsers['users']>([], []),
    mfaRequired: new FormControl<boolean>(false),
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
          const group = await this.adminService.group(this.id)
          this.form.reset({
            name: group.name,
            mfaRequired: group.mfaRequired,
            users: group.users.map((u) => {
              return { id: u.id, username: u.username }
            }),
          })
        }

        this.users = await this.adminService.users()
        this.userAutoFilter()

        if (this.form.controls.name.value?.toLowerCase() === ADMIN_GROUP.toLowerCase()) {
          this.form.controls.name.disable()
        }
      } catch (e) {
        console.error(e)
        this.snackbarService.error('Error loading group.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }

  userAutoFilter(value: string = '') {
    this.unselectedUsers = this.users.filter((u) => {
      return !this.form.controls.users.value?.find(gu => u.id === gu.id)
    })
    this.selectableUsers = this.unselectedUsers.filter((u) => {
      return u.username.toLowerCase().includes(value.toLowerCase())
        || u.email?.toLowerCase().includes(value.toLowerCase())
        || u.name?.toLowerCase().includes(value.toLowerCase())
    }).slice(0, 5)
    if (this.unselectedUsers.length) {
      this.userSelect.enable()
    } else {
      this.userSelect.disable()
    }
  }

  addUser(event: MatAutocompleteSelectedEvent) {
    const value = event.option.value as UserWithoutPassword | null
    if (!value) {
      return
    }
    this.form.controls.users.setValue([{ id: value.id, username: value.username }]
      .concat(this.form.controls.users.value ?? []).sort((a, b) => {
        return a.id > b.id ? 1 : -1
      }))
    this.form.controls.users.markAsDirty()
    this.userSelect.setValue(null)
    this.userAutoFilter()
  }

  removeUser(value: string) {
    this.form.controls.users.setValue((this.form.controls.users.value ?? []).filter(u => u.id !== value))
    this.form.controls.users.markAsDirty()
    this.userAutoFilter()
  }

  async submit() {
    try {
      const values = this.form.getRawValue()
      const { name, mfaRequired, users } = values
      if (!this.id || name == null || mfaRequired == null || users == null) {
        throw new Error('Missing required information.')
      }

      this.spinnerService.show()
      const group = await this.adminService.upsertGroup({ ...values, name, mfaRequired, users, id: this.id })
      this.snackbarService.message(`Group ${this.id ? 'updated' : 'created'}.`)

      this.id = group.id
      await this.router.navigate(['/admin/group', this.id], {
        replaceUrl: true,
      })
    } catch (_e) {
      this.snackbarService.error(`Could not ${this.id ? 'update' : 'create'} group.`)
    } finally {
      this.spinnerService.hide()
    }
  }

  remove() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to delete this group?`,
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
          await this.adminService.deleteGroup(this.id)
        }

        this.snackbarService.message('Group deleted.')
        await this.router.navigate(['/admin/groups'])
      } catch (_e) {
        this.snackbarService.error('Could not delete group.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }
}
