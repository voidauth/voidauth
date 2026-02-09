import { Component, inject, viewChild } from '@angular/core'
import { MaterialModule } from '../../../material-module'
import { MatPaginator } from '@angular/material/paginator'
import { MatSort } from '@angular/material/sort'
import { MatTableDataSource } from '@angular/material/table'
import { AdminService } from '../../../services/admin.service'
import { SnackbarService } from '../../../services/snackbar.service'
import { SpinnerService } from '../../../services/spinner.service'
import type { TableColumn } from '../clients/clients.component'
import type { PasswordResetUser } from '@shared/api-response/admin/PasswordResetUser'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import type { UserWithoutPassword } from '@shared/api-response/UserDetails'
import { ValidationErrorPipe } from '../../../pipes/ValidationErrorPipe'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { ConfigService } from '../../../services/config.service'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../../dialogs/confirm/confirm.component'
import { humanDuration } from '@shared/utils'
import { AsyncPipe } from '@angular/common'

@Component({
  selector: 'app-password-sets',
  imports: [
    MaterialModule,
    ValidationErrorPipe,
    ReactiveFormsModule,
    AsyncPipe,
  ],
  templateUrl: './password-resets.component.html',
  styleUrl: './password-resets.component.scss',
})
export class PasswordResetsComponent {
  dataSource: MatTableDataSource<PasswordResetUser> = new MatTableDataSource()

  readonly paginator = viewChild.required(MatPaginator)
  readonly sort = viewChild.required(MatSort)

  columns: TableColumn<PasswordResetUser>[] = [
    {
      columnDef: 'username',
      header: 'Username',
      cell: element => element.username,
    },
    {
      columnDef: 'expiresAt',
      header: 'Expires In',
      cell: element => humanDuration(new Date(element.expiresAt).getTime() - new Date().getTime()),
    },
  ]

  displayedColumns = ([] as string[]).concat(this.columns.map(c => c.columnDef)).concat(['actions'])

  users: UserWithoutPassword[] = []
  selectableUsers: UserWithoutPassword[] = []
  userSelect = new FormControl<UserWithoutPassword | null>(null)

  config?: ConfigResponse

  adminService = inject(AdminService)
  snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private configService = inject(ConfigService)
  private dialog = inject(MatDialog)

  async ngAfterViewInit() {
    // Assign the data to the data source for the table to render
    try {
      this.spinnerService.show()
      this.users = (await this.adminService.users()).sort((a, b) => {
        return a.username.localeCompare(b.username, undefined, { sensitivity: 'base' })
      })
      this.userAutoFilter()

      this.config = await this.configService.getConfig()

      this.dataSource.data = await this.adminService.passwordResets()
      this.dataSource.paginator = this.paginator()
      this.dataSource.sort = this.sort()
    } finally {
      this.spinnerService.hide()
    }
  }

  async create() {
    try {
      this.spinnerService.show()
      const user = this.userSelect.value
      if (!user) {
        throw new Error('User not selected.')
      }

      const reset = await this.adminService.createPasswordReset({ userId: user.id })
      const data = [reset].concat(this.dataSource.data)
      this.dataSource.data = this.dataSource.sortData(data, this.sort())
      this.snackbarService.message('Password reset link was created.')
    } catch (_e) {
      this.snackbarService.error('Could not create password reset link.')
    } finally {
      this.spinnerService.hide()
    }
  }

  delete(id: string) {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to delete this password reset link?`,
        header: 'Delete',
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        await this.adminService.deletePasswordReset(id)
        this.dataSource.data = this.dataSource.data.filter(g => g.id !== id)
        this.snackbarService.message('Password reset link was deleted.')
      } catch (_e) {
        this.snackbarService.error('Could not delete password reset link.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }

  userAutoFilter(value: string = '') {
    this.selectableUsers = this.users.filter((u) => {
      return u.username.toLowerCase().includes(value.toLowerCase())
        || u.email?.toLowerCase().includes(value.toLowerCase())
        || u.name?.toLowerCase().includes(value.toLowerCase())
    }).slice(0, 5)
  }

  displayUser(user?: UserWithoutPassword) {
    return user?.username ?? ''
  }

  async sendEmail(reset: PasswordResetUser) {
    try {
      if (!reset.email) {
        throw new Error('User does not have email address.')
      }
      this.spinnerService.show()
      await this.adminService.sendPasswordReset(reset.id)
      this.snackbarService.message(`Password reset link sent to ${reset.email}.`)
    } catch (_e) {
      this.snackbarService.error('Could not send password reset link.')
    } finally {
      this.spinnerService.hide()
    }
  }
}
