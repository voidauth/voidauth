import { Component, inject, viewChild, ChangeDetectionStrategy, signal } from '@angular/core'
import { MaterialModule } from '../../../material-module'
import { MatPaginator } from '@angular/material/paginator'
import { MatSort } from '@angular/material/sort'
import { MatTableDataSource } from '@angular/material/table'
import { AdminService } from '../../../services/admin.service'
import { SnackbarService } from '../../../services/snackbar.service'
import { SpinnerService } from '../../../services/spinner.service'
import type { TableColumn } from '../clients/clients.component'
import type { PasswordResetUser } from '@shared/api-response/admin/PasswordResetUser'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import type { UserWithoutPassword } from '@shared/api-response/UserDetails'
import { ValidationErrorPipe } from '../../../pipes/ValidationErrorPipe'
import type { ConfigResponse } from '@shared/api-response/ConfigResponse'
import { ConfigService } from '../../../services/config.service'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../../dialogs/confirm/confirm.component'
import { stringCompare } from '@shared/utils'
import { AsyncPipe } from '@angular/common'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { HumanDurationPipe } from '../../../pipes/HumanDurationPipe'
import { LooseAsyncPipe } from '../../../pipes/LooseAsyncPipe'
import { TableService } from '../../../services/table.service'
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs'

@Component({
  selector: 'app-password-resets',
  imports: [
    MaterialModule,
    ValidationErrorPipe,
    ReactiveFormsModule,
    AsyncPipe,
    LooseAsyncPipe,
    TranslatePipe,
  ],
  templateUrl: './password-resets.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './password-resets.component.scss',
})
export class PasswordResetsComponent {
  private translate = inject(TranslateService)
  dataSource: MatTableDataSource<PasswordResetUser> = new MatTableDataSource()

  readonly paginator = viewChild.required(MatPaginator)
  readonly sort = viewChild.required(MatSort)

  columns: TableColumn<PasswordResetUser>[] = [
    {
      columnDef: 'username',
      header: 'Username',
      cell: element => element.username,
    },
    {
      columnDef: 'expiresAt',
      header: 'Expires In',
      cell: element => HumanDurationPipe.t(new Date(element.expiresAt).getTime() - new Date().getTime(), this.translate),
    },
  ]

  displayedColumns = ([] as string[]).concat(this.columns.map(c => c.columnDef)).concat(['actions'])

  selectableUsers = signal<UserWithoutPassword[]>([])
  userSelect = new FormControl<UserWithoutPassword | null>(null)
  userSelectInputSubject = new Subject<string>()

  config?: ConfigResponse

  adminService = inject(AdminService)
  snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private configService = inject(ConfigService)
  private dialog = inject(MatDialog)
  private translateService = inject(TranslateService)
  readonly tableService = inject(TableService)

  async ngAfterViewInit() {
    try {
      this.spinnerService.show()
      const currentPageSize = this.tableService.currentPageSize
      if (currentPageSize !== null) {
        this.paginator().pageSize = currentPageSize
      }

      const [config, _] = await Promise.all([
        this.configService.getConfig(),
        this.setData(),
      ])

      this.config = config

      this.paginator().page.subscribe(async (event) => {
        this.tableService.currentPageSize = event.pageSize
        await this.setData()
      })

      this.sort().sortChange.subscribe(async () => {
        await this.setData()
      })

      this.userSelectInputSubject.pipe(
        debounceTime(300),
        distinctUntilChanged(),
      ).subscribe(async (value) => {
        await this.userAutoFilter(value)
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
      const data = await this.adminService.passwordResets(pageIndex, pageSize, sortActive, sortDirection)
      this.dataSource.data = data.passwordResets
      this.paginator().length = data.count
    } catch (_e) {
      this.snackbarService.error(String(this.translate.instant('admin.password-resets.messages.load-failed')))
    } finally {
      this.spinnerService.hide()
    }
  }

  async create() {
    try {
      this.spinnerService.show()
      const user = this.userSelect.value
      if (!user) {
        throw new Error('User not selected.')
      }

      await this.adminService.createPasswordReset({ userId: user.id })
      this.userSelect.reset()
      await this.setData()
      this.snackbarService.message(String(this.translate.instant('admin.password-resets.messages.created')))
    } catch (_e) {
      this.snackbarService.error(String(this.translate.instant('admin.password-resets.messages.create-failed')))
    } finally {
      this.spinnerService.hide()
    }
  }

  onDelete(id: string) {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: String(this.translate.instant('admin.password-resets.dialogs.delete')),
        header: String(this.translate.instant('admin.common.actions.delete')),
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()
        await this.adminService.deletePasswordReset(id)
        await this.setData()
        this.snackbarService.message(String(this.translate.instant('admin.password-resets.messages.deleted')))
      } catch (_e) {
        this.snackbarService.error(String(this.translate.instant('admin.password-resets.messages.delete-failed')))
      } finally {
        this.spinnerService.hide()
      }
    })
  }

  async userAutoFilter(value: string = '') {
    this.selectableUsers.set((await this.adminService.users(0, 5, value)).users.sort((a, b) => {
      return stringCompare(a.username, b.username)
    }))
  }

  displayUser(user?: UserWithoutPassword) {
    return user?.username ?? ''
  }

  onCopyResetLink() {
    this.snackbarService.message(String(this.translateService.instant('admin.password-resets.messages.link-copied')))
  }

  async sendEmail(reset: PasswordResetUser) {
    try {
      if (!reset.email) {
        throw new Error('User does not have email address.')
      }
      this.spinnerService.show()
      await this.adminService.sendPasswordReset(reset.id)
      this.snackbarService.message(String(this.translate.instant('admin.password-resets.messages.sent', { email: reset.email })))
    } catch (_e) {
      this.snackbarService.error(String(this.translate.instant('admin.password-resets.messages.send-failed')))
    } finally {
      this.spinnerService.hide()
    }
  }
}
