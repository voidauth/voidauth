import { Component, inject, ViewChild } from "@angular/core"
import { MatPaginator } from "@angular/material/paginator"
import { MatSort } from "@angular/material/sort"
import { MatTableDataSource } from "@angular/material/table"
import type { Group } from "@shared/db/Group"
import { AdminService } from "../../../services/admin.service"
import { SnackbarService } from "../../../services/snackbar.service"
import type { TableColumn } from "../clients/clients.component"
import { CommonModule } from "@angular/common"
import { MaterialModule } from "../../../material-module"
import { ADMIN_GROUP } from "@shared/constants"
import { RouterLink } from "@angular/router"

@Component({
  selector: "app-groups",
  imports: [
    CommonModule,
    MaterialModule,
    RouterLink,
  ],
  templateUrl: "./groups.component.html",
  styleUrl: "./groups.component.scss",
})
export class GroupsComponent {
  dataSource: MatTableDataSource<Group> = new MatTableDataSource()

  @ViewChild(MatPaginator) paginator!: MatPaginator
  @ViewChild(MatSort) sort!: MatSort

  columns: TableColumn<Group>[] = [
    {
      columnDef: "name",
      header: "Group Name",
      cell: element => element.name,
    },
  ]

  displayedColumns = ([] as string[]).concat(this.columns.map(c => c.columnDef)).concat(["actions"])

  public ADMIN_GROUP = ADMIN_GROUP

  private adminService = inject(AdminService)
  private snackbarService = inject(SnackbarService)

  async ngAfterViewInit() {
    // Assign the data to the data source for the table to render
    this.dataSource.data = await this.adminService.groups()
    this.dataSource.paginator = this.paginator
    this.dataSource.sort = this.sort
  }

  async delete(id: string) {
    try {
      await this.adminService.deleteGroup(id)
      this.dataSource.data = this.dataSource.data.filter(g => g.id !== id)
      this.snackbarService.show("Group was deleted.")
    } catch (_e) {
      this.snackbarService.error("Could not delete group.")
    }
  }
}
