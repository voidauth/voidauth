import { Component, inject, viewChild } from '@angular/core'
import { MatPaginator } from '@angular/material/paginator'
import { MatSort } from '@angular/material/sort'
import { MatTableDataSource } from '@angular/material/table'
import type { TableColumn } from '../clients/clients.component'
import type { EmailLog } from '@shared/db/EmailLog'
import { AdminService } from '../../../services/admin.service'
import { SnackbarService } from '../../../services/snackbar.service'
import { SpinnerService } from '../../../services/spinner.service'
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog'
import { MaterialModule } from '../../../material-module'
import { RouterLink } from '@angular/router'
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser'
import DOMPurify from 'isomorphic-dompurify'

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

  previewEmail(email: EmailLog) {
    this.dialog.open(DialogExampleComponent, {
      data: email,
      width: '600px',
      height: 'calc(100% - 16px)',
    })
  }
}

@Component({
  selector: 'app-dialog-example',
  imports: [
    MaterialModule,
  ],
  template: `
    <h2 mat-dialog-title><b>{{dialogData.subject}}</b></h2>
    <div class="content">
      <p>To: {{dialogData.to}}</p>
      <div style="flex-grow: 1;">
        <iframe [srcdoc]="body"></iframe>
      </div>
    </div>
    <mat-dialog-actions>
      <button mat-button [mat-dialog-close]="true">Close</button>
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .content {
      display: flex;
      flex-direction: column;
      flex-grow: 1;
      padding: 0px 16px;
    }

    iframe {
      width: 100%;
      height: calc(100% - 6px);
      border-radius: 16px;
      border: 0px;
    }
  `,
})
export class DialogExampleComponent {
  dialogData = inject<EmailLog>(MAT_DIALOG_DATA)
  sanitizer = inject(DomSanitizer)
  body?: SafeHtml
  constructor() {
    if (this.dialogData.body) {
      this.body = this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(this.dialogData.body))
    }
  }
}
