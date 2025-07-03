import { Component, inject, ViewChild, type AfterViewInit } from '@angular/core'
import { AdminService } from '../../../services/admin.service'
import { MaterialModule } from '../../../material-module'
import type { ClientMetadata } from 'oidc-provider'
import { MatPaginator } from '@angular/material/paginator'
import { MatSort } from '@angular/material/sort'
import { MatTableDataSource } from '@angular/material/table'
import { SnackbarService } from '../../../services/snackbar.service'
import { RouterLink } from '@angular/router'
import { SpinnerService } from '../../../services/spinner.service'
import { OidcInfoComponent } from '../../../components/oidc-info/oidc-info.component'

export type TableColumn<T> = {
  columnDef: keyof T & string
  header: string
  isIcon?: boolean
  cell: (element: T) => string
}

@Component({
  selector: 'app-clients',
  imports: [
    MaterialModule,
    RouterLink,
    OidcInfoComponent,
  ],
  templateUrl: './clients.component.html',
  styleUrl: './clients.component.scss',
})
export class ClientsComponent implements AfterViewInit {
  dataSource: MatTableDataSource<ClientMetadata> = new MatTableDataSource()

  @ViewChild(MatPaginator) paginator!: MatPaginator
  @ViewChild(MatSort) sort!: MatSort

  columns: TableColumn<ClientMetadata>[] = [
    {
      columnDef: 'client_id',
      header: 'Client ID',
      cell: element => element.client_id,
    },
    {
      columnDef: 'redirect_uris',
      header: 'Redirects',
      cell: element => String(element.redirect_uris?.join('\n')),
    },
  ]

  displayedColumns = this.columns.map(c => c.columnDef).concat('actions')

  private adminService = inject(AdminService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)

  async ngAfterViewInit() {
    try {
      // Assign the data to the data source for the table to render
      this.spinnerService.show()
      this.dataSource.data = await this.adminService.clients()
      this.dataSource.paginator = this.paginator
      this.dataSource.sort = this.sort
    } finally {
      this.spinnerService.hide()
    }
  }

  async delete(client_id: string) {
    try {
      this.spinnerService.show()
      await this.adminService.deleteClient(client_id)
      this.dataSource.data = this.dataSource.data.filter(c => c.client_id !== client_id)
      this.snackbarService.show(`Client ${client_id} was deleted.`)
    } catch (_e) {
      this.snackbarService.error('Could not delete client.')
    } finally {
      this.spinnerService.hide()
    }
  }
}
