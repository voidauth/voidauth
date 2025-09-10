import { Component, inject, type OnInit } from '@angular/core'
import { AdminService } from '../../../../services/admin.service'
import { CommonModule } from '@angular/common'
import { MaterialModule } from '../../../../material-module'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { ValidationErrorPipe } from '../../../../pipes/ValidationErrorPipe'
import { ActivatedRoute, Router } from '@angular/router'
import { SnackbarService } from '../../../../services/snackbar.service'
import { isValidURL, isValidURLControl, isValidWebURLControl } from '../../../../validators/validators'
import { generate } from 'generate-password-browser'
import { GRANT_TYPES, RESPONSE_TYPES, UNIQUE_RESPONSE_TYPES, type ClientUpsert } from '@shared/api-request/admin/ClientUpsert'
import type { ResponseType } from 'oidc-provider'
import type { itemIn } from '@shared/utils'
import { HttpErrorResponse } from '@angular/common/http'
import { SpinnerService } from '../../../../services/spinner.service'
import { OidcInfoComponent } from '../../../../components/oidc-info/oidc-info.component'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../../../dialogs/confirm/confirm.component'
import type { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'

export type TypedControls<T> = {
  [K in keyof Required<T>]: FormControl<T[K] | null>
}

@Component({
  selector: 'app-upsert-client',
  imports: [
    CommonModule,
    MaterialModule,
    ValidationErrorPipe,
    ReactiveFormsModule,
    OidcInfoComponent,
  ],
  templateUrl: './upsert-client.component.html',
  styleUrl: './upsert-client.component.scss',
})
export class UpsertClientComponent implements OnInit {
  public authMethods = [
    'client_secret_basic',
    'client_secret_jwt',
    'client_secret_post',
    // 'private_key_jwt', // do not enable until jwk_uri is ready
    'none',
  ]

  public applicationTypes: ClientUpsert['application_type'][] = [
    'web',
    'native',
  ]

  public uniqueResponseTypes = UNIQUE_RESPONSE_TYPES

  public grantTypes = GRANT_TYPES

  public client_id: string | null = null

  public groups: string[] = []
  public unselectedGroups: string[] = []
  public selectableGroups: string[] = []
  groupSelect = new FormControl<string>({
    value: '',
    disabled: false,
  }, [])

  redirectUrlControl = new FormControl<string>({
    value: '',
    disabled: false,
  }, [isValidURLControl])

  responseTypeControl = new FormControl<itemIn<typeof UNIQUE_RESPONSE_TYPES>[]>([], [(c) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (c.value?.length === 1 && c.value[0] === 'token') {
      return { invalid: 'This is an invalid Response Type selection.' }
    }
    return null
  }])

  postLogoutUrlControl = new FormControl<string | null>(null, [isValidURLControl])

  form = new FormGroup<TypedControls<ClientUpsert>>({
    client_id: new FormControl<string | null>(null, [Validators.required]),
    redirect_uris: new FormControl<string[]>([], [Validators.required, Validators.minLength(1)]),
    client_secret: new FormControl<string>('', [Validators.required, Validators.minLength(4)]),
    token_endpoint_auth_method: new FormControl<ClientUpsert['token_endpoint_auth_method']>('client_secret_post'),
    response_types: new FormControl<ResponseType[]>(['code'], [(c) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!c.value?.length) {
        return { invalid: 'This is an invalid Response Type selection.' }
      }
      return null
    }]),
    grant_types: new FormControl<itemIn<typeof GRANT_TYPES>[]>(['authorization_code', 'refresh_token']),
    application_type: new FormControl<ClientUpsert['application_type']>('web'),
    post_logout_redirect_uris: new FormControl<ClientUpsert['post_logout_redirect_uris']>([], [(c) => {
      if ((c.value as string[]).some(v => typeof v === 'string' && v && !isValidURL(v))) {
        return {
          isValidUrl: 'Must be a valid URL.',
        }
      }
      return null
    }]),
    skip_consent: new FormControl<boolean>(true),
    logo_uri: new FormControl<string | null>(null, [isValidWebURLControl]),
    groups: new FormControl<ClientUpsert['groups']>([]),
  })

  pwdShow = false

  private adminService = inject(AdminService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)
  private dialog = inject(MatDialog)

  ngOnInit() {
    this.route.paramMap.subscribe(async (params) => {
      try {
        this.spinnerService.show()
        this.client_id = params.get('client_id')

        this.groups = (await this.adminService.groups()).map(g => g.name)
        this.groupAutoFilter()

        if (this.client_id) {
          const client = await this.adminService.client(this.client_id)
          this.form.reset({
            client_id: client.client_id,
            client_secret: client.client_secret ?? '',
            redirect_uris: client.redirect_uris ?? [],
            token_endpoint_auth_method: client.token_endpoint_auth_method ?? 'client_secret_post',
            response_types: client.response_types ?? ['code'],
            grant_types: client.grant_types ?? ['authorization_code', 'refresh_token'],
            application_type: client.application_type ?? 'web',
            post_logout_redirect_uris: client.post_logout_redirect_uris ?? [],
            skip_consent: client['skip_consent'] ?? true,
            logo_uri: client.logo_uri,
            groups: client.groups,
          })

          this.form.controls.client_id.disable()

          const initialResponseType: itemIn<typeof UNIQUE_RESPONSE_TYPES>[] = []
          if (client.response_types?.some(t => t.includes('code'))) {
            initialResponseType.push('code')
          }
          if (client.response_types?.some(t => t.includes('id_token'))) {
            initialResponseType.push('id_token')
          }
          if (client.response_types?.some(t => t.includes('token'))) {
            initialResponseType.push('token')
          }
          this.responseTypeControl.setValue(initialResponseType)

          this.postLogoutUrlControl.setValue(this.form.controls.post_logout_redirect_uris.value?.[0] ?? null)
        }
      } catch (e) {
        console.error(e)
        this.snackbarService.error('Error loading Client.')
      } finally {
        this.spinnerService.hide()
      }
    })

    this.responseTypeControl.valueChanges.subscribe((value) => {
      const response_types: ResponseType[] = []
      if (!value?.length) {
        response_types.push('none')
      } else {
        RESPONSE_TYPES.forEach((rt) => {
          if ((rt.split(' ') as ('code' | 'id_token' | 'token')[]).every(rs => value.includes(rs))) {
            response_types.push(rt)
          }
        })
      }
      this.form.controls.response_types.setValue(response_types)
      this.form.controls.response_types.markAsDirty()
    })

    this.postLogoutUrlControl.valueChanges.subscribe((value) => {
      if (value) {
        this.form.controls.post_logout_redirect_uris.setValue([value])
      } else {
        this.form.controls.post_logout_redirect_uris.setValue([])
      }
      this.form.controls.post_logout_redirect_uris.markAsDirty()
    })
  }

  async submit() {
    try {
      this.spinnerService.show()

      if (this.client_id) {
        await this.adminService.updateClient(this.form.getRawValue())
      } else {
        await this.adminService.addClient(this.form.getRawValue())
      }

      this.snackbarService.message(`Client ${this.client_id ? 'updated' : 'created'}.`)
      this.client_id = this.form.getRawValue().client_id
      if (!this.client_id) {
        throw new Error()
      }
      await this.router.navigate(['/admin/client', this.client_id], {
        replaceUrl: true,
      })
    } catch (e) {
      console.error(e)

      let shownError: string | null = null
      if (e instanceof HttpErrorResponse) {
        shownError ??= e.error?.message
      } else {
        shownError ??= (e as Error).message
      }

      shownError ??= `Could not ${this.client_id ? 'update' : 'create'} client.`
      this.snackbarService.error(shownError)
    } finally {
      this.spinnerService.hide()
    }
  }

  deleteClient() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to delete this client?`,
        header: 'Delete',
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        this.snackbarService.error('Client delete cancelled.')
        return
      }

      try {
        this.spinnerService.show()

        if (this.client_id) {
          await this.adminService.deleteClient(this.client_id)
        }

        this.snackbarService.message('Client deleted.')
        await this.router.navigate(['/admin/clients'])
      } catch (_e) {
        this.snackbarService.error('Could not delete client.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }

  generateSecret() {
    this.form.controls.client_secret.setValue(generate({
      length: 32,
      numbers: true,
      strict: true,
    }))
    this.form.controls.client_secret.markAsDirty()
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

  addRedirectUrl(value: string) {
    if (this.form.controls.redirect_uris.value?.includes(value)) {
      return
    }
    this.form.controls.redirect_uris.setValue([value].concat(this.form.controls.redirect_uris.value ?? []).sort())
    this.form.controls.redirect_uris.markAsDirty()
  }

  removeRedirectUrl(value: string) {
    this.form.controls.redirect_uris.setValue((this.form.controls.redirect_uris.value ?? []).filter(r => r !== value))
    this.form.controls.redirect_uris.markAsDirty()
  }
}
