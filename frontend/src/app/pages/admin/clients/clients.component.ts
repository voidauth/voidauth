import { Component, inject, type AfterViewInit, viewChild, ChangeDetectionStrategy } from '@angular/core'
import { AdminService } from '../../../services/admin.service'
import { MaterialModule } from '../../../material-module'
import { MatPaginator } from '@angular/material/paginator'
import { MatSort } from '@angular/material/sort'
import { MatTableDataSource } from '@angular/material/table'
import { SnackbarService } from '../../../services/snackbar.service'
import { RouterLink } from '@angular/router'
import { SpinnerService } from '../../../services/spinner.service'
import { OidcInfoComponent } from '../../../components/oidc-info/oidc-info.component'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../../dialogs/confirm/confirm.component'
import type { ClientResponse } from '@shared/api-response/ClientResponse'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import type { Observable } from 'rxjs'
import { TableService } from '../../../services/table.service'

export type TableColumn<T> = {
  columnDef: keyof T & string
  header: string
  isIcon?: boolean
  isImage?: boolean
  cell: (element: T) => string | Observable<unknown>
}

@Component({
  selector: 'app-clients',
  imports: [MaterialModule, RouterLink, OidcInfoComponent, TranslatePipe],
  templateUrl: './clients.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './clients.component.scss',
})
export class ClientsComponent implements AfterViewInit {
  dataSource: MatTableDataSource<ClientResponse> = new MatTableDataSource()

  readonly paginator = viewChild.required(MatPaginator)
  readonly sort = viewChild.required(MatSort)

  columns: TableColumn<ClientResponse>[] = [
    {
      columnDef: 'logo_uri',
      header: '',
      isImage: true,
      cell: element => element.logo_uri ?? '',
    },
    {
      columnDef: 'client_name',
      header: 'admin.clients.columns.name',
      cell: element => element.client_name ?? element.client_id,
    },
    {
      columnDef: 'redirect_uris',
      header: 'admin.clients.columns.redirects',
      cell: element => element.redirect_uris?.join('\n') ?? '-',
    },
    {
      columnDef: 'groups',
      header: 'admin.clients.columns.allowed-groups',
      cell: element => (element.groups.length ? element.groups.join('\n') : '*'),
    },
  ]

  displayedColumns = this.columns.map(c => c.columnDef).concat('actions')

  private adminService = inject(AdminService)
  private translateService = inject(TranslateService)
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
      this.dataSource.data = await this.adminService.clients()
      this.dataSource.paginator = this.paginator()
      this.dataSource.sort = this.sort()
    } finally {
      this.spinnerService.hide()
    }
  }

  resizeLogo(event: Event, targetSize: number) {
    const image = event.currentTarget
    if (!(image instanceof HTMLImageElement)) {
      return
    }
    const scale = targetSize / Math.max(image.naturalWidth, image.naturalHeight)
    image.style.width = `${String(Math.ceil(image.naturalWidth * scale))}px`
    image.style.height = `${String(Math.ceil(image.naturalHeight * scale))}px`
  }

  onDelete(client_id: string) {
    const client = this.dataSource.data.find(c => c.client_id === client_id)
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: String(this.translateService.instant('admin.clients.dialogs.delete', { name: client?.client_name ?? client_id })),
        header: String(this.translateService.instant('admin.common.actions.delete')),
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        await this.adminService.deleteClient(client_id)
        this.dataSource.data = this.dataSource.data.filter(c => c.client_id !== client_id)
        this.snackbarService.message(
          String(this.translateService.instant('admin.clients.messages.deleted', { name: client?.client_name ?? client_id })),
        )
      } catch (_e) {
        this.snackbarService.error(String(this.translateService.instant('admin.clients.messages.delete-failed')))
      } finally {
        this.spinnerService.hide()
      }
    })
  }
}
