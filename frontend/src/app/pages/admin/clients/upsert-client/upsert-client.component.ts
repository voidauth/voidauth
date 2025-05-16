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
    'client_secret_jwt',
    'client_secret_post',
    'private_key_jwt',
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
    client_id: new FormControl<string | null>(null, [Validators.required]),
    redirect_uris: new FormControl<string[]>([], [Validators.required, Validators.minLength(1)]),
    client_secret: new FormControl<string>('', [Validators.required, Validators.minLength(4)]),
    token_endpoint_auth_method: new FormControl<ClientUpsert['token_endpoint_auth_method']>('client_secret_basic'),
    skip_consent: new FormControl<boolean>(false),
    logo_uri: new FormControl<string | null>(null, [isValidURL]),
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
            token_endpoint_auth_method: client.token_endpoint_auth_method ?? 'client_secret_basic',
            skip_consent: client['skip_consent'] ?? false,
            logo_uri: client.logo_uri,
          })
          this.profile.setValue(!!(client.scope?.includes('profile')))
          this.email.setValue(!!(client.scope?.includes('email')))
          this.groups.setValue(!!(client.scope?.includes('groups')))
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
    this.form.controls.client_secret.markAsDirty()
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
