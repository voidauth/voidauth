import { Component, inject, ViewChild } from "@angular/core"
import { MatPaginator } from "@angular/material/paginator"
import { MatSort } from "@angular/material/sort"
import { MatTableDataSource } from "@angular/material/table"
import { AdminService } from "../../../services/admin.service"
import { SnackbarService } from "../../../services/snackbar.service"
import type { TableColumn } from "../clients/clients.component"
import { RouterLink } from "@angular/router"
import { MaterialModule } from "../../../material-module"
import type { Invitation } from "@shared/db/Invitation"
import { SpinnerService } from "../../../services/spinner.service"

@Component({
  selector: "app-invitations",
  imports: [
    MaterialModule,
    RouterLink,
  ],
  templateUrl: "./invitations.component.html",
  styleUrl: "./invitations.component.scss",
})
export class InvitationsComponent {
  dataSource: MatTableDataSource<Invitation> = new MatTableDataSource()

  @ViewChild(MatPaginator) paginator!: MatPaginator
  @ViewChild(MatSort) sort!: MatSort

  columns: TableColumn<Invitation>[] = [
    {
      columnDef: "username",
      header: "Username",
      cell: element => element.username ?? "-",
    },
    {
      columnDef: "email",
      header: "Email",
      cell: element => element.email ?? "-",
    },
    {
      columnDef: "name",
      header: "Name",
      cell: element => element.name ?? "-",
    },
    {
      columnDef: "expiresAt",
      header: "Expires In",
      cell: element => humanDuration(new Date(element.expiresAt).getTime() - new Date().getTime()),
    },
  ]

  displayedColumns = ([] as string[]).concat(this.columns.map(c => c.columnDef)).concat(["actions"])

  private adminService = inject(AdminService)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)

  async ngAfterViewInit() {
    // Assign the data to the data source for the table to render
    try {
      this.spinnerService.show()
      this.dataSource.data = await this.adminService.invitations()
      this.dataSource.paginator = this.paginator
      this.dataSource.sort = this.sort
    } finally {
      this.spinnerService.hide()
    }
  }

  async delete(id: string) {
    try {
      this.spinnerService.show()
      await this.adminService.deleteInvitation(id)
      this.dataSource.data = this.dataSource.data.filter(g => g.id !== id)
      this.snackbarService.show("Invitation was deleted.")
    } catch (_e) {
      this.snackbarService.error("Could not delete invitation.")
    } finally {
      this.spinnerService.hide()
    }
  }
}

function humanDuration(ms: number): string {
  const MINUTE = 60
  const HOUR = MINUTE * 60
  const DAY = HOUR * 24
  const WEEK = DAY * 7
  const YEAR = DAY * 365.25
  const MONTH = YEAR / 12

  const seconds = Math.floor(ms / 1000)
  const years = Math.floor(seconds / YEAR)
  const months = Math.floor(seconds / MONTH)
  const weeks = Math.floor(seconds / WEEK)
  const days = Math.floor(seconds / DAY)
  const hours = Math.floor(seconds / HOUR)
  const minutes = Math.floor(seconds / MINUTE)

  if (years || months > 11) {
    return String(Math.max(years, 1)) + " year" + ((years > 1) ? "s" : "")
  }

  if (months || weeks > 4) {
    return String(Math.max(months, 1)) + " month" + ((months > 1) ? "s" : "")
  }

  if (weeks || days > 6) {
    return String(Math.max(weeks, 1)) + " week" + ((weeks > 1) ? "s" : "")
  }

  if (days || hours > 23) {
    return String(Math.max(days, 1)) + " day" + ((days > 1) ? "s" : "")
  }

  if (hours || minutes > 59) {
    return String(Math.max(hours, 1)) + " hour" + ((hours > 1) ? "s" : "")
  }

  if (minutes || seconds > 59) {
    return String(Math.max(minutes, 1)) + " minute" + ((minutes > 1) ? "s" : "")
  }

  if (seconds || ms > 500) {
    return String(Math.max(seconds, 1)) + " second" + ((seconds > 1) ? "s" : "")
  }
  return "now"
}
