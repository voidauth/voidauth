import { Component, inject } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import type { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'
import { ActivatedRoute, Router } from '@angular/router'
import { AdminService } from '../../../../services/admin.service'
import { SnackbarService } from '../../../../services/snackbar.service'
import { SpinnerService } from '../../../../services/spinner.service'
import type { TypedControls } from '../../clients/upsert-client/upsert-client.component'
import type { ProxyAuthUpsert } from '@shared/api-request/admin/ProxyAuthUpsert'
import { CommonModule } from '@angular/common'
import { MaterialModule } from '../../../../material-module'
import { ValidationErrorPipe } from '../../../../pipes/ValidationErrorPipe'
import { isValidWildcardDomain } from '@shared/utils'
import type { ProxyAuthResponse } from '@shared/api-response/admin/ProxyAuthResponse'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../../../dialogs/confirm/confirm.component'

@Component({
  selector: 'app-domain',
  imports: [
    CommonModule,
    MaterialModule,
    ValidationErrorPipe,
    ReactiveFormsModule,
  ],
  templateUrl: './domain.component.html',
  styleUrl: './domain.component.scss',
})
export class DomainComponent {
  public id: string | null = null

  public groups: string[] = []
  public unselectedGroups: string[] = []
  public selectableGroups: string[] = []
  groupSelect = new FormControl<string>({
    value: '',
    disabled: false,
  }, [])

  public form = new FormGroup<TypedControls<Omit<ProxyAuthUpsert, 'id'>>>({
    domain: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required, (c) => {
      if (!isValidWildcardDomain(c.value as string)) {
        return { invalid: 'Must be a valid domain with optional path, supports wildcard (*)' }
      }
      return null
    }]),
    groups: new FormControl<string[]>({
      value: [],
      disabled: false,
    }, []),
    maxSessionLength: new FormControl<number | null>(null, [Validators.min(5), Validators.max(525600)]),
    mfaRequired: new FormControl<boolean>(false),
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
          const proxyAuth = await this.adminService.proxyAuth(this.id)
          this.resetForm(proxyAuth)
        }

        this.groups = (await this.adminService.groups()).map(g => g.name)
        this.groupAutoFilter()
      } catch (e) {
        console.error(e)
        this.snackbarService.error('Error loading ProxyAuth domain.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }

  resetForm(proxyAuth: ProxyAuthResponse) {
    this.form.reset({ domain: proxyAuth.domain,
      groups: proxyAuth.groups,
      mfaRequired: proxyAuth.mfaRequired,
      maxSessionLength: proxyAuth.maxSessionLength,
    })
  }

  groupAutoFilter(value: string = '') {
    this.unselectedGroups = this.groups.filter((g) => {
      return !this.form.controls.groups.value?.includes(g)
    })
    this.selectableGroups = this.unselectedGroups.filter((g) => {
      return g.toLowerCase().includes(value.toLowerCase())
    }).slice(0, 5)
    if (this.unselectedGroups.length) {
      this.groupSelect.enable()
    } else {
      this.groupSelect.disable()
    }
  }

  addGroup(event: MatAutocompleteSelectedEvent) {
    const value = event.option.value as string
    if (!value) {
      return
    }
    this.form.controls.groups.setValue([value].concat(this.form.controls.groups.value ?? []).sort())
    this.form.controls.groups.markAsDirty()
    this.groupSelect.setValue(null)
    this.groupAutoFilter()
  }

  removeGroup(value: string) {
    this.form.controls.groups.setValue((this.form.controls.groups.value ?? []).filter(g => g !== value))
    this.form.controls.groups.markAsDirty()
    this.groupAutoFilter()
  }

  async submit() {
    try {
      this.spinnerService.show()
      const response = await this.adminService.upsertProxyAuth({ ...this.form.getRawValue(), id: this.id })
      this.snackbarService.message(`Domain ${this.id ? 'updated' : 'created'}.`)

      this.id = response.id
      this.resetForm(response)
      await this.router.navigate(['/admin/domain', this.id], {
        replaceUrl: true,
      })
    } catch (_e) {
      this.snackbarService.error(`Could not ${this.id ? 'update' : 'create'} domain.`)
    } finally {
      this.spinnerService.hide()
    }
  }

  remove() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to delete this domain?`,
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
          await this.adminService.deleteProxyAuth(this.id)
        }

        this.snackbarService.message('Domain deleted.')
        await this.router.navigate(['/admin/domains'])
      } catch (_e) {
        this.snackbarService.error('Could not delete domain.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }
}
