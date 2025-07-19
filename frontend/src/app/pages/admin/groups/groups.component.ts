import { Component, inject, viewChild } from '@angular/core'
import { MatPaginator } from '@angular/material/paginator'
import { MatSort } from '@angular/material/sort'
import { MatTableDataSource } from '@angular/material/table'
import type { Group } from '@shared/db/Group'
import { AdminService } from '../../../services/admin.service'
import { SnackbarService } from '../../../services/snackbar.service'
import type { TableColumn } from '../clients/clients.component'
import { MaterialModule } from '../../../material-module'
import { ADMIN_GROUP } from '@shared/constants'
import { RouterLink } from '@angular/router'
import { SpinnerService } from '../../../services/spinner.service'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../../dialogs/confirm/confirm.component'

@Component({
  selector: 'app-groups',
  imports: [
    MaterialModule,
    RouterLink,
  ],
  templateUrl: './groups.component.html',
  styleUrl: './groups.component.scss',
})
export class GroupsComponent {
  dataSource: MatTableDataSource<Group> = new MatTableDataSource()

  readonly paginator = viewChild.required(MatPaginator)
  readonly sort = viewChild.required(MatSort)

  columns: TableColumn<Group>[] = [
    {
      columnDef: 'name',
      header: 'Group Name',
      cell: element => element.name,
    },
  ]

  displayedColumns = ([] as string[]).concat(this.columns.map(c => c.columnDef)).concat(['actions'])

  public ADMIN_GROUP = ADMIN_GROUP

  private adminService = inject(AdminService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private dialog = inject(MatDialog)

  async ngAfterViewInit() {
    try {
      // Assign the data to the data source for the table to render
      this.spinnerService.show()
      this.dataSource.data = await this.adminService.groups()
      this.dataSource.paginator = this.paginator()
      this.dataSource.sort = this.sort()
    } finally {
      this.spinnerService.hide()
    }
  }

  delete(id: string) {
    const group = this.dataSource.data.find(g => g.id === id)
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to remove group '${group?.name ?? id}'?`,
        header: 'Delete',
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        this.snackbarService.error('Group delete cancelled.')
        return
      }

      try {
        this.spinnerService.show()
        await this.adminService.deleteGroup(id)
        this.dataSource.data = this.dataSource.data.filter(g => g.id !== id)
        this.snackbarService.message('Group was deleted.')
      } catch (_e) {
        this.snackbarService.error('Could not delete group.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }
}
