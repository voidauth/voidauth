import { CommonModule } from '@angular/common'
import { Component, inject, type OnInit } from '@angular/core'
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { MaterialModule } from '../../../../material-module'
import { ValidationErrorPipe } from '../../../../pipes/ValidationErrorPipe'
import { AdminService } from '../../../../services/admin.service'
import { SnackbarService } from '../../../../services/snackbar.service'
import type { TypedControls } from '../../clients/upsert-client/upsert-client.component'
import type { UserUpdate } from '@shared/api-request/admin/UserUpdate'
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'
import { USERNAME_REGEX } from '@shared/constants'
import type { CurrentUserDetails, UserDetails } from '@shared/api-response/UserDetails'
import { UserService } from '../../../../services/user.service'
import { SpinnerService } from '../../../../services/spinner.service'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../../../dialogs/confirm/confirm.component'
import type { ItemIn, Nullable } from '@shared/utils'
import { isValidEmail } from '../../../../validators/validators'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  selector: 'app-user',
  imports: [
    CommonModule,
    MaterialModule,
    RouterLink,
    ValidationErrorPipe,
    ReactiveFormsModule,
    TranslatePipe,
  ],
  templateUrl: './user.component.html',
  styleUrl: './user.component.scss',
})
export class UserComponent implements OnInit {
  public me?: CurrentUserDetails
  public id: string | null = null

  public groups: ItemIn<UserDetails['groups']>[] = []
  public unselectedGroups: ItemIn<UserDetails['groups']>[] = []
  public selectableGroups: ItemIn<UserDetails['groups']>[] = []
  groupSelect = new FormControl<string>({
    value: '',
    disabled: false,
  }, [])

  public form = new FormGroup({
    username: new FormControl<string | null>(null, [Validators.required, Validators.minLength(1), Validators.pattern(USERNAME_REGEX)]),
    email: new FormControl<string | null>(null, [isValidEmail]),
    name: new FormControl<string | null>(null, [Validators.minLength(1)]),
    expiresAt: new FormControl<Date | null>(null, []),
    emailVerified: new FormControl<boolean>(false, { nonNullable: true }),
    approved: new FormControl<boolean>(false, { nonNullable: true }),
    mfaRequired: new FormControl<boolean>(false, { nonNullable: true }),
    groups: new FormControl<UserDetails['groups']>([], { nonNullable: true }),
  }) satisfies FormGroup<TypedControls<Omit<UserUpdate, 'id' | 'username'> & Nullable<Pick<UserUpdate, 'username'>>>>

  private adminService = inject(AdminService)
  private userService = inject(UserService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private dialog = inject(MatDialog)

  ngOnInit() {
    this.route.paramMap.subscribe(async (params) => {
      try {
        this.spinnerService.show()

        this.me = await this.userService.getMyUser()

        this.id = params.get('id')

        if (!this.id) {
          throw new Error('User ID missing.')
        }

        const user = await this.adminService.user(this.id)

        this.form.reset({
          username: user.username,
          name: user.name ?? null,
          email: user.email ?? '',
          emailVerified: !!user.emailVerified,
          approved: !!user.approved,
          mfaRequired: !!user.mfaRequired,
          groups: user.groups,
          expiresAt: user.expiresAt ? new Date(user.expiresAt) : null,
        })

        this.groups = await this.adminService.groups()
        this.groupAutoFilter()
      } catch (e) {
        console.error(e)
        this.snackbarService.error('Error loading user.')
      } finally {
        this.spinnerService.hide()
      }
    })

    // Keeps the expiresAt datepicker and timepicker in sync
    this.form.controls.expiresAt.valueChanges.subscribe((value) => {
      this.form.controls.expiresAt.setValue(value, { emitEvent: false })
    })
  }

  groupAutoFilter(value: string = '') {
    this.unselectedGroups = this.groups.filter((g) => {
      return !this.form.controls.groups.value.some(f => f.name === g.name)
    })
    this.selectableGroups = this.unselectedGroups.filter((g) => {
      return g.name.toLowerCase().includes(value.toLowerCase())
    }).slice(0, 5)
    if (this.unselectedGroups.length) {
      this.groupSelect.enable()
    } else {
      this.groupSelect.disable()
    }
  }

  addGroup(event: MatAutocompleteSelectedEvent) {
    const value = event.option.value as ItemIn<UserDetails['groups']> | null
    if (!value) {
      return
    }
    this.form.controls.groups.setValue([value].concat(this.form.controls.groups.value)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })))
    this.form.controls.groups.markAsDirty()
    this.groupSelect.setValue(null)
    this.groupAutoFilter()
  }

  removeGroup(value: string) {
    this.form.controls.groups.setValue((this.form.controls.groups.value).filter(g => g.name !== value))
    this.form.controls.groups.markAsDirty()
    this.groupAutoFilter()
  }

  async submit() {
    try {
      const values = this.form.getRawValue()
      const { username } = values

      if (!this.id || !username) {
        throw new Error('Missing required information.')
      }

      this.spinnerService.show()

      await this.adminService.updateUser({ ...values, username, id: this.id })
      this.snackbarService.message('User updated.')
    } catch (_e) {
      this.snackbarService.error('Could not update user.')
    } finally {
      this.spinnerService.hide()
    }
  }

  async signout() {
    this.spinnerService.show()
    try {
      if (this.id) {
        await this.adminService.signOutUser(this.id)
      }

      this.snackbarService.message('User signed out.')
    } catch (_e) {
      this.snackbarService.error('Could not sign out user.')
    } finally {
      this.spinnerService.hide()
    }
  }

  remove() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to delete this user?`,
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
          await this.adminService.deleteUser(this.id)
        }

        this.snackbarService.message('User deleted.')
        await this.router.navigate(['/admin/users'])
      } catch (_e) {
        this.snackbarService.error('Could not delete user.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }
}
