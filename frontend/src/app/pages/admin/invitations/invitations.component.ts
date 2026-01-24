import { Component, inject, viewChild } from '@angular/core'
import { MatPaginator } from '@angular/material/paginator'
import { MatSort } from '@angular/material/sort'
import { MatTableDataSource } from '@angular/material/table'
import { AdminService } from '../../../services/admin.service'
import { SnackbarService } from '../../../services/snackbar.service'
import type { TableColumn } from '../clients/clients.component'
import { RouterLink } from '@angular/router'
import { MaterialModule } from '../../../material-module'
import type { Invitation } from '@shared/db/Invitation'
import { SpinnerService } from '../../../services/spinner.service'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../../dialogs/confirm/confirm.component'
import { humanDuration } from '@shared/utils'

@Component({
  selector: 'app-invitations',
  imports: [
    MaterialModule,
    RouterLink,
  ],
  templateUrl: './invitations.component.html',
  styleUrl: './invitations.component.scss',
})
export class InvitationsComponent {
  dataSource: MatTableDataSource<Invitation> = new MatTableDataSource()

  readonly paginator = viewChild.required(MatPaginator)
  readonly sort = viewChild.required(MatSort)

  columns: TableColumn<Invitation>[] = [
    {
      columnDef: 'username',
      header: 'Username',
      cell: element => element.username ?? '-',
    },
    {
      columnDef: 'email',
      header: 'Email',
      cell: element => element.email ?? '-',
    },
    {
      columnDef: 'expiresAt',
      header: 'Expires In',
      cell: element => humanDuration(new Date(element.expiresAt).getTime() - new Date().getTime()),
    },
  ]

  displayedColumns = ([] as string[]).concat(this.columns.map(c => c.columnDef)).concat(['actions'])

  private adminService = inject(AdminService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private dialog = inject(MatDialog)

  async ngAfterViewInit() {
    // Assign the data to the data source for the table to render
    try {
      this.spinnerService.show()
      this.dataSource.data = await this.adminService.invitations()
      this.dataSource.paginator = this.paginator()
      this.dataSource.sort = this.sort()
    } finally {
      this.spinnerService.hide()
    }
  }

  delete(id: string) {
    const invite = this.dataSource.data.find(i => i.id === id)
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to remove invitation for '${invite?.username ?? invite?.email ?? id}'?`,
        header: 'Delete',
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        await this.adminService.deleteInvitation(id)
        this.dataSource.data = this.dataSource.data.filter(g => g.id !== id)
        this.snackbarService.message('Invitation was deleted.')
      } catch (_e) {
        this.snackbarService.error('Could not delete invitation.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }
}
