import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { ConfirmComponent } from '../../../../dialogs/confirm/confirm.component'
import { MaterialModule } from '../../../../material-module'
import { AdminService } from '../../../../services/admin.service'
import { SnackbarService } from '../../../../services/snackbar.service'
import { SpinnerService } from '../../../../services/spinner.service'
import { ValidationErrorPipe } from '../../../../pipes/ValidationErrorPipe'
import { CUSTOM_CLAIM_REGEX } from '@shared/constants'
import type { CustomClaimDetails } from '@shared/api-response/admin/CustomClaimDetails'

@Component({
  selector: 'app-custom-claim',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, ValidationErrorPipe, TranslatePipe],
  templateUrl: './custom-claim.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './custom-claim.component.scss',
})
export class CustomClaimComponent {
  public id: string | null = null

  public form = new FormGroup({
    claim: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(CUSTOM_CLAIM_REGEX)],
    }),
    users: new FormControl<CustomClaimDetails['users']>([], { nonNullable: true }),
    groups: new FormControl<CustomClaimDetails['groups']>([], { nonNullable: true }),
    invitations: new FormControl<CustomClaimDetails['invitations']>([], { nonNullable: true }),
  })

  private adminService = inject(AdminService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private dialog = inject(MatDialog)

  ngOnInit() {
    this.route.paramMap.subscribe(async (params) => {
      try {
        this.spinnerService.show()
        const id = params.get('id')

        if (id) {
          this.id = id
          const claim = await this.adminService.customClaim(this.id)
          this.form.reset({
            claim: claim.claim,
          })
        }
      } catch (e) {
        console.error(e)
        this.snackbarService.error('Error loading custom claim.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }

  async submit() {
    try {
      const values = this.form.getRawValue()

      this.spinnerService.show()
      const response = await this.adminService.upsertCustomClaim({
        id: this.id ?? undefined,
        ...values,
      })
      this.snackbarService.message(`Custom claim ${this.id ? 'updated' : 'created'}.`)

      this.id = response.id
      await this.router.navigate(['/admin/claim', this.id], {
        replaceUrl: true,
      })
    } catch (_e) {
      this.snackbarService.error(`Could not ${this.id ? 'update' : 'create'} custom claim.`)
    } finally {
      this.spinnerService.hide()
    }
  }

  remove() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: 'Are you sure you want to delete this custom claim?',
        header: 'Delete',
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }
      try {
        this.spinnerService.show()

        if (this.id) {
          await this.adminService.deleteCustomClaim(this.id)
        }

        this.snackbarService.message('Custom claim deleted.')
        await this.router.navigate(['/admin/claims'])
      } catch (_e) {
        this.snackbarService.error('Could not delete custom claim.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }
}
