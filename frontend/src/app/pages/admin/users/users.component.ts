import { Component, inject, ViewChild } from '@angular/core'
import { MaterialModule } from '../../../material-module'
import { MatTableDataSource } from '@angular/material/table'
import { MatPaginator } from '@angular/material/paginator'
import { MatSort } from '@angular/material/sort'
import { AdminService } from '../../../services/admin.service'
import { SnackbarService } from '../../../services/snackbar.service'
import type { TableColumn } from '../clients/clients.component'
import { RouterLink } from '@angular/router'
import { UserService } from '../../../services/user.service'
import type { UserDetails, UserWithoutPassword } from '@shared/api-response/UserDetails'
import { SpinnerService } from '../../../services/spinner.service'

@Component({
  selector: 'app-users',
  imports: [
    MaterialModule,
    RouterLink,
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class UsersComponent {
  public me?: UserDetails

  dataSource: MatTableDataSource<UserWithoutPassword> = new MatTableDataSource()

  @ViewChild(MatPaginator) paginator!: MatPaginator
  @ViewChild(MatSort) sort!: MatSort

  columns: TableColumn<UserWithoutPassword>[] = [
    {
      columnDef: 'username',
      header: 'Username',
      cell: element => element.username,
    },
    {
      columnDef: 'email',
      header: 'Email',
      cell: element => element.email ?? '',
    },
    {
      columnDef: 'emailVerified',
      header: 'Email Verified',
      isIcon: true,
      cell: element => element.emailVerified ? 'done' : 'not_interested',
    },
    {
      columnDef: 'approved',
      header: 'Approved',
      isIcon: true,
      cell: element => element.approved ? 'done' : 'not_interested',
    },
  ]

  displayedColumns = ([] as string[]).concat(this.columns.map(c => c.columnDef)).concat(['actions'])

  private adminService = inject(AdminService)
  private snackbarService = inject(SnackbarService)
  private userService = inject(UserService)
  private spinnerService = inject(SpinnerService)

  async ngAfterViewInit() {
    // Assign the data to the data source for the table to render
    try {
      this.spinnerService.show()
      this.me = await this.userService.getMyUser()
      this.dataSource.data = await this.adminService.users()
      this.dataSource.paginator = this.paginator
      this.dataSource.sort = this.sort
    } finally {
      this.spinnerService.hide()
    }
  }

  async delete(id: string) {
    try {
      this.spinnerService.show()
      await this.adminService.deleteUser(id)
      this.dataSource.data = this.dataSource.data.filter(g => g.id !== id)
      this.snackbarService.show('User was deleted.')
    } catch (_e) {
      this.snackbarService.error('Could not delete user.')
    } finally {
      this.spinnerService.hide()
    }
  }
}
