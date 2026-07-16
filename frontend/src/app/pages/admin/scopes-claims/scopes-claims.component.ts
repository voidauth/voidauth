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
import type { CustomClaimsResponse } from '@shared/api-response/admin/CustomClaimResponse'
import { TranslatePipe } from '@ngx-translate/core'
import { RouterLink } from '@angular/router'

@Component({
  selector: 'app-scopes-claims',
  imports: [
    MaterialModule,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: './scopes-claims.component.html',
  styleUrl: './scopes-claims.component.scss',
})
export class ScopesClaimsComponent {
  dataSource: MatTableDataSource<CustomClaimsResponse> = new MatTableDataSource()

  readonly paginator = viewChild.required(MatPaginator)
  readonly sort = viewChild.required(MatSort)

  columns: TableColumn<CustomClaimsResponse>[] = [
    {
      columnDef: 'scope',
      header: 'Scope',
      cell: element => element.scope,
    },
    {
      columnDef: 'claim',
      header: 'Claim',
      cell: element => element.claim || '-',
    },
    {
      columnDef: 'includedInLdap',
      header: 'Included in LDAP',
      cell: element => element.includedInLdap ? 'Yes' : 'No',
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
      this.dataSource.data = await this.adminService.customScopesClaims()
      this.dataSource.paginator = this.paginator()
      this.dataSource.sort = this.sort()
    } finally {
      this.spinnerService.hide()
    }
  }

  delete(scopeId: string, claimId: string | null) {
    const customClaim = this.dataSource.data.find(i => i.scopeId === scopeId && i.claimId === claimId)
    if (!customClaim) {
      return
    }
    const message = customClaim.claim
      ? `Are you sure you want to remove custom claim '${customClaim.scope}/${customClaim.claim}'?`
      : `Are you sure you want to remove custom scope '${customClaim.scope}'?`
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: message,
        header: 'Delete',
      },
    })

    dialogRef.afterClosed().subscribe((result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        // TODO: Implement delete custom scope claim API call
        console.error('Not Implemented: delete custom scope claim')
        this.snackbarService.error('Not Implemented: delete custom scope claim')
        // this.dataSource.data = this.dataSource.data.filter(g => g.claimId !== customClaim.claimId)
        // this.snackbarService.message('Custom claim was deleted.')
      } catch (_e) {
        this.snackbarService.error('Could not delete custom claim.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }
}
