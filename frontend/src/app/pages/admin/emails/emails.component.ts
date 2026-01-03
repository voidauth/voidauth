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
import { EmailInputComponent } from '../../../dialogs/email-input/email-input.component'
import { UserService } from '../../../services/user.service'
import type { CurrentUserDetails } from '@shared/api-response/UserDetails'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { ConfigService } from '../../../services/config.service'

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
      cell: element => new Date(element.createdAt).toDateString(),
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
  private userService = inject(UserService)
  private configService = inject(ConfigService)

  me?: CurrentUserDetails
  public config?: ConfigResponse

  async ngAfterViewInit() {
    // Assign the data to the data source for the table to render
    try {
      this.spinnerService.show()

      this.me = await this.userService.getMyUser()
      this.config = await this.configService.getConfig()
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
      this.spinnerService.show()
      const pageIndex = this.paginator().pageIndex
      const pageSize = this.paginator().pageSize
      const sortActive = this.sort().active
      const sortDirection = this.sort().direction
      const data = await this.adminService.emails(pageIndex, pageSize, sortActive, sortDirection)
      this.dataSource.data = data.emails
      this.paginator().length = data.count
    } catch (_e) {
      this.snackbarService.error('Could not get Sent Mail.')
    } finally {
      this.spinnerService.hide()
    }
  }

  sendTestEmail() {
    const testEmailDialog = this.dialog.open<EmailInputComponent, { message?: string, header?: string, initial?: string }>(
      EmailInputComponent, {
        data: {
          header: 'Send Test Email',
          initial: this.me?.email ?? undefined,
        },
        disableClose: true,
      })

    testEmailDialog.afterClosed().subscribe(async (data) => {
      if (data && typeof data === 'string') {
        try {
          this.spinnerService.show()
          await this.adminService.sendTestEmail(data)
          await this.setData()
          this.snackbarService.message('Sent Test Email.')
        } catch (e) {
          console.error(e)
          this.snackbarService.error('Could not send Test Email.')
        } finally {
          this.spinnerService.hide()
        }
      }
    })
  }

  previewEmail(email: EmailLog) {
    this.dialog.open(EmailPreviewComponent, {
      data: email,
      width: '600px',
      height: 'calc(100% - 16px)',
    })
  }
}

@Component({
  selector: 'app-email-preview',
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
class EmailPreviewComponent {
  dialogData = inject<EmailLog>(MAT_DIALOG_DATA)
  sanitizer = inject(DomSanitizer)
  body?: SafeHtml
  constructor() {
    if (this.dialogData.body) {
      this.body = this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(this.dialogData.body))
    }
  }
}
