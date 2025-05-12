import { Component, inject, type OnInit } from '@angular/core'
import { AdminService } from '../../../../services/admin.service'
import { CommonModule } from '@angular/common'
import { MaterialModule } from '../../../../material-module'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { ValidationErrorPipe } from '../../../../pipes/ValidationErrorPipe'
import { ActivatedRoute, Router } from '@angular/router'
import { SnackbarService } from '../../../../services/snackbar.service'
import { isValidURL } from '../../../../validators/validators'
import { generate } from 'generate-password-browser'
import type { ClientUpsert } from '@shared/api-request/admin/ClientUpsert'

export type TypedFormGroup<T> = {
  [K in keyof Required<T>]: FormControl<T[K] | null>
}

@Component({
  selector: 'app-upsert-client',
  imports: [
    CommonModule,
    MaterialModule,
    ValidationErrorPipe,
    ReactiveFormsModule,
  ],
  templateUrl: './upsert-client.component.html',
  styleUrl: './upsert-client.component.scss',
})
export class UpsertClientComponent implements OnInit {
  public authMethods = [
    'client_secret_basic',
    'client_secret_post',
    'client_secret_jwt',
    'private_key_jwt',
    'tls_client_auth',
    'self_signed_tls_client_auth',
    'none',
  ]

  public client_id: string | null = null
  public hasLoaded = false

  redirectUrlControl = new FormControl<string>({
    value: '',
    disabled: false,
  }, [isValidURL])

  profile = new FormControl<boolean>(true)
  email = new FormControl<boolean>(true)
  groups = new FormControl<boolean>(true)

  form = new FormGroup<TypedFormGroup<ClientUpsert>>({
    client_id: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required]),
    redirect_uris: new FormControl<string[]>({
      value: [],
      disabled: false,
    }, [Validators.required, Validators.minLength(1)]),
    client_secret: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required, Validators.minLength(4)]),
    scope: new FormControl<string>({
      value: 'openid',
      disabled: false,
    }, [Validators.required]),
    token_endpoint_auth_method: new FormControl<Required<ClientUpsert>['token_endpoint_auth_method']>('none'),
    logo_uri: new FormControl<string | null>({
      value: null,
      disabled: true,
    }, [isValidURL]),
  })

  private adminService = inject(AdminService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private snackbarService = inject(SnackbarService)

  ngOnInit() {
    this.route.paramMap.subscribe(async (params) => {
      try {
        this.client_id = params.get('client_id')

        this.disablePage()

        if (this.client_id) {
          const client = await this.adminService.client(this.client_id)
          this.form.reset({
            client_id: client.client_id,
            client_secret: client.client_secret ?? '',
            redirect_uris: client.redirect_uris ?? [],
            token_endpoint_auth_method: client.token_endpoint_auth_method ?? 'none',
          })
        }

        this.enablePage()
        this.hasLoaded = true
      } catch (e) {
        console.error(e)
        this.snackbarService.error('Error loading Client.')
      }
    })
  }

  disablePage() {
    this.form.disable()
    this.redirectUrlControl.disable()
  }

  enablePage() {
    this.form.enable()
    this.redirectUrlControl.enable()
    if (this.client_id) {
      this.form.controls.client_id.disable()
    }
  }

  async submit() {
    try {
      this.disablePage()

      const scopes = 'openid' + `${this.profile ? ' profile' : ''}` + `${this.email ? ' email' : ''}` + `${this.groups ? ' groups' : ''}`
      this.form.controls.scope.setValue(scopes)

      if (this.client_id) {
        await this.adminService.updateClient(this.form.getRawValue())
      } else {
        await this.adminService.addClient(this.form.getRawValue())
      }

      this.snackbarService.show(`Client ${this.client_id ? 'updated' : 'created'}.`)
      this.client_id = this.form.value.client_id ?? null
      await this.router.navigate(['/admin/client', this.client_id], {
        replaceUrl: true,
      })
    } catch (_e) {
      this.snackbarService.error(`Could not ${this.client_id ? 'update' : 'create'} client.`)
    } finally {
      this.enablePage()
    }
  }

  async deleteClient() {
    try {
      this.disablePage()

      if (this.client_id) {
        await this.adminService.deleteClient(this.client_id)
      }

      this.snackbarService.show(`Client deleted.`)
      await this.router.navigate(['/admin/clients'])
    } catch (_e) {
      this.snackbarService.error(`Could not delete client.`)
    } finally {
      this.enablePage()
    }
  }

  generateSecret() {
    this.form.controls.client_secret.setValue(generate({
      length: 32,
      numbers: true,
      strict: true,
    }))
  }

  addRedirectUrl(value: string) {
    this.form.controls.redirect_uris.setValue([value].concat(this.form.controls.redirect_uris.value ?? []).sort())
    this.form.controls.redirect_uris.markAsDirty()
  }

  removeRedirectUrl(value: string) {
    this.form.controls.redirect_uris.setValue((this.form.controls.redirect_uris.value ?? []).filter(r => r !== value))
    this.form.controls.redirect_uris.markAsDirty()
  }
}
