import { Component, inject, viewChild, ChangeDetectionStrategy } from '@angular/core'
import { MatPaginator } from '@angular/material/paginator'
import { type Sort } from '@angular/material/sort'
import { MatTableDataSource } from '@angular/material/table'
import type { ProxyAuthResponse } from '@shared/api-response/admin/ProxyAuthResponse'
import { AdminService } from '../../../services/admin.service'
import { SnackbarService } from '../../../services/snackbar.service'
import { SpinnerService } from '../../../services/spinner.service'
import type { TableColumn } from '../clients/clients.component'
import { RouterLink } from '@angular/router'
import { MaterialModule } from '../../../material-module'
import { sortWildcardDomains } from '@shared/url'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../../dialogs/confirm/confirm.component'
import { TranslatePipe } from '@ngx-translate/core'
import { stringCompare } from '@shared/utils'
import { TableService } from '../../../services/table.service'

@Component({
  selector: 'app-domains',
  imports: [MaterialModule, RouterLink, TranslatePipe],
  templateUrl: './domains.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './domains.component.scss',
})
export class DomainsComponent {
  dataSource: MatTableDataSource<ProxyAuthResponse> = new MatTableDataSource()

  readonly paginator = viewChild.required(MatPaginator)

  columns: TableColumn<ProxyAuthResponse>[] = [
    {
      columnDef: 'domain',
      header: 'Domains',
      cell: element => element.domain,
    },
    {
      columnDef: 'groups',
      header: 'Allowed Groups',
      cell: element => (element.groups.length ? element.groups.join('\n') : '*'),
    },
  ]

  displayedColumns = (this.columns.map(c => c.columnDef) as string[]).concat('actions')

  private adminService = inject(AdminService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private dialog = inject(MatDialog)
  readonly tableService = inject(TableService)

  async ngAfterViewInit() {
    try {
      // Assign the data to the data source for the table to render
      this.spinnerService.show()
      const currentPageSize = this.tableService.currentPageSize
      if (currentPageSize !== null) {
        this.paginator().pageSize = currentPageSize
      }
      this.paginator().page.subscribe((event) => {
        this.tableService.currentPageSize = event.pageSize
      })
      this.dataSource.data = await this.adminService.proxyAuths()
      this.dataSource.paginator = this.paginator()
    } finally {
      this.spinnerService.hide()
    }
  }

  onSortChange(event: Sort) {
    const field = event.active as keyof ProxyAuthResponse
    if (field === 'domain') {
      this.dataSource.data.sort((a, b) => sortWildcardDomains(a.domain, b.domain))
    } else {
      this.dataSource.data.sort((a, b) => {
        return stringCompare(String(a[field]), String(b[field]))
      })
    }

    if (event.direction === 'desc') {
      this.dataSource.data.reverse()
    }

    this.dataSource.data = this.dataSource.data.splice(0)
  }

  onDelete(proxyauth_id: string) {
    const domain = this.dataSource.data.find(d => d.id === proxyauth_id)
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to remove domain '${domain?.domain ?? proxyauth_id}'?`,
        header: 'Delete',
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        await this.adminService.deleteProxyAuth(proxyauth_id)
        this.dataSource.data = this.dataSource.data.filter(c => c.id !== proxyauth_id)
        this.snackbarService.message('Domain was deleted.')
      } catch (_e) {
        this.snackbarService.error('Could not delete domain.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }
}
