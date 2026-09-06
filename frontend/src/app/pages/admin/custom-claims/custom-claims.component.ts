import { Component, inject, viewChild } from '@angular/core'
import { MaterialModule } from '../../../material-module'
import { MatDialog } from '@angular/material/dialog'
import { MatPaginator } from '@angular/material/paginator'
import { MatSort } from '@angular/material/sort'
import { MatTableDataSource } from '@angular/material/table'
import { ConfirmComponent } from '../../../dialogs/confirm/confirm.component'
import { AdminService } from '../../../services/admin.service'
import { SnackbarService } from '../../../services/snackbar.service'
import { SpinnerService } from '../../../services/spinner.service'
import type { TableColumn } from '../clients/clients.component'
import { TranslatePipe } from '@ngx-translate/core'
import { RouterLink } from '@angular/router'
import type { CustomClaim } from '@shared/db/CustomClaim'
import { TableService } from '../../../services/table.service'

@Component({
  selector: 'app-custom-claims',
  imports: [
    MaterialModule,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: './custom-claims.component.html',
  styleUrl: './custom-claims.component.scss',
})
export class CustomClaimsComponent {
  dataSource: MatTableDataSource<CustomClaim> = new MatTableDataSource()

  readonly paginator = viewChild.required(MatPaginator)
  readonly sort = viewChild.required(MatSort)

  columns: TableColumn<CustomClaim>[] = [
    {
      columnDef: 'claim',
      header: 'Claim',
      cell: element => element.claim || '-',
    },
  ]

  displayedColumns = ([] as string[]).concat(this.columns.map(c => c.columnDef)).concat(['actions'])

  private adminService = inject(AdminService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private dialog = inject(MatDialog)
  readonly tableService = inject(TableService)

  async ngAfterViewInit() {
    // Assign the data to the data source for the table to render
    try {
      this.spinnerService.show()
      const currentPageSize = this.tableService.currentPageSize
      if (currentPageSize !== null) {
        this.paginator().pageSize = currentPageSize
      }
      this.paginator().page.subscribe((event) => {
        this.tableService.currentPageSize = event.pageSize
      })
      this.dataSource.data = await this.adminService.customClaims()
      this.dataSource.paginator = this.paginator()
      this.dataSource.sort = this.sort()
    } finally {
      this.spinnerService.hide()
    }
  }

  onDelete(id: string) {
    const customClaim = this.dataSource.data.find(i => i.id === id)
    if (!customClaim) {
      return
    }

    const message = `Are you sure you want to remove custom claim '${customClaim.claim}'?`
    const confirmDialog = this.dialog.open(ConfirmComponent, {
      data: {
        message: message,
        header: 'Delete',
      },
    })
    confirmDialog.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        await this.adminService.deleteCustomClaim(id)
        this.snackbarService.message('Custom claim was deleted.')
        this.dataSource.data = await this.adminService.customClaims()
      } catch (_e) {
        this.snackbarService.error('Could not delete custom claim.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }
}
