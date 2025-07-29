import { Component, inject, viewChild } from '@angular/core'
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
import type { MatCheckbox, MatCheckboxChange } from '@angular/material/checkbox'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../../dialogs/confirm/confirm.component'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { debounceTime, distinctUntilChanged } from 'rxjs'

@Component({
  selector: 'app-users',
  imports: [
    MaterialModule,
    RouterLink,
    ReactiveFormsModule,
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class UsersComponent {
  public me?: UserDetails

  dataSource: MatTableDataSource<UserWithoutPassword> = new MatTableDataSource()

  readonly paginator = viewChild.required(MatPaginator)
  readonly sort = viewChild.required(MatSort)

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

  displayedColumns = ['multi'].concat(this.columns.map(c => c.columnDef)).concat(['actions'])

  selected: { id: string, source: MatCheckbox }[] = []

  search = new FormControl<string>('')

  private adminService = inject(AdminService)
  private snackbarService = inject(SnackbarService)
  private userService = inject(UserService)
  private spinnerService = inject(SpinnerService)
  readonly dialog = inject(MatDialog)

  async ngAfterViewInit() {
    // Assign the data to the data source for the table to render
    try {
      this.spinnerService.show()
      this.me = await this.userService.getMyUser()
      this.dataSource.data = await this.adminService.users()
      this.dataSource.paginator = this.paginator()
      this.dataSource.sort = this.sort()

      this.paginator().page.subscribe((_p) => {
        this.selected.forEach(s => s.source.checked = false)
        this.selected = []
      })
    } finally {
      this.spinnerService.hide()
    }

    this.search.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
    ).subscribe((searchTerm) => {
      console.log(searchTerm)
      this.adminService.users(searchTerm).then((users) => {
        this.dataSource.data = users
      }).catch((e: unknown) => {
        console.error(e)
      })
    })
  }

  delete(id: string) {
    const user = this.dataSource.data.find(u => u.id === id)
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to remove user '${user?.username ?? id}'?`,
        header: 'Delete',
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        this.snackbarService.error('User delete cancelled.')
        return
      }
      try {
        this.spinnerService.show()
        await this.adminService.deleteUser(id)
        this.dataSource.data = this.dataSource.data.filter(g => g.id !== id)
        this.snackbarService.message('User was deleted.')
      } catch (_e) {
        this.snackbarService.error('Could not delete user.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }

  select(id: string, event: MatCheckboxChange) {
    if (event.checked) {
      this.selected.push({ id, source: event.source })
    } else {
      this.selected = this.selected.filter(u => u.id !== id)
    }
  }

  approveSelected() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to approve ${String(this.selected.length)} user(s)?`,
        header: 'Approval',
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        this.snackbarService.error('Approval Cancelled.')
        return
      }
      try {
        this.spinnerService.show()
        await this.adminService.approveUsers(this.selected.map(s => s.id))
        this.dataSource.data.forEach((u) => {
          if (this.selected.find(s => s.id === u.id)) {
            u.approved = true
          }
        })
        this.selected.forEach(s => s.source.checked = false)
        this.selected = []

        this.snackbarService.message('User(s) were approved.')
      } catch (_e) {
        this.snackbarService.error('Could not approve user(s).')
      } finally {
        this.spinnerService.hide()
      }
    })
  }
}
