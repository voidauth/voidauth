import { Component, inject, viewChild } from '@angular/core'
import { MatPaginator } from '@angular/material/paginator'
import { MatSort } from '@angular/material/sort'
import { MatTableDataSource } from '@angular/material/table'
import type { TableColumn } from '../clients/clients.component'
import type { EmailLog } from '@shared/db/EmailLog'
import { AdminService } from '../../../services/admin.service'
import { SnackbarService } from '../../../services/snackbar.service'
import { SpinnerService } from '../../../services/spinner.service'
import { MatDialog } from '@angular/material/dialog'
import { MaterialModule } from '../../../material-module'
import { RouterLink } from '@angular/router'

@Component({
  selector: 'app-emails',
  imports: [
    MaterialModule,
    RouterLink,
  ],
  templateUrl: './emails.component.html',
  styleUrl: './emails.component.scss',
})
export class EmailsComponent {
  dataSource: MatTableDataSource<EmailLog> = new MatTableDataSource()

  readonly paginator = viewChild.required(MatPaginator)
  readonly sort = viewChild.required(MatSort)

  columns: TableColumn<EmailLog>[] = [
    {
      columnDef: 'createdAt',
      header: 'Sent',
      cell: element => String(element.createdAt),
    },
    {
      columnDef: 'to',
      header: 'To',
      cell: element => element.to,
    },
    {
      columnDef: 'type',
      header: 'Type',
      cell: element => element.type,
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
      await this.setData()

      this.paginator().page.subscribe(async () => {
        await this.setData()
      })

      this.sort().sortChange.subscribe(async () => {
        await this.setData()
      })
    } finally {
      this.spinnerService.hide()
    }
  }

  async setData() {
    try {
      const pageIndex = this.paginator().pageIndex
      const pageSize = this.paginator().pageSize
      const sortActive = this.sort().active
      const sortDirection = this.sort().direction
      const data = await this.adminService.emails(pageIndex, pageSize, sortActive, sortDirection)
      this.dataSource.data = data.emails
      this.paginator().length = data.count
    } catch (_e) {
      this.snackbarService.error('Could not get Sent Mail.')
    }
  }
}
