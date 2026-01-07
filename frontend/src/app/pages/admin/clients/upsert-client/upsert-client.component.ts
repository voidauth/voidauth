import { Component, inject, type OnInit } from '@angular/core'
import { AdminService } from '../../../../services/admin.service'
import { CommonModule } from '@angular/common'
import { MaterialModule } from '../../../../material-module'
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { ValidationErrorPipe } from '../../../../pipes/ValidationErrorPipe'
import { ActivatedRoute, Router } from '@angular/router'
import { SnackbarService } from '../../../../services/snackbar.service'
import { isValidWebURLControl, isValidWildcardRedirectControl } from '../../../../validators/validators'
import { generate } from 'generate-password-browser'
import { GRANT_TYPES, RESPONSE_TYPES, UNIQUE_RESPONSE_TYPES, type ClientUpsert } from '@shared/api-request/admin/ClientUpsert'
import type { ClientAuthMethod, ResponseType } from 'oidc-provider'
import type { itemIn } from '@shared/utils'
import { HttpErrorResponse } from '@angular/common/http'
import { SpinnerService } from '../../../../services/spinner.service'
import { OidcInfoComponent } from '../../../../components/oidc-info/oidc-info.component'
import { MatDialog } from '@angular/material/dialog'
import { ConfirmComponent } from '../../../../dialogs/confirm/confirm.component'
import type { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'
import { isValidWildcardRedirect, validateWildcardRedirects } from '@shared/utils'

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
  public authMethods: { name: string, value: ClientAuthMethod }[] = [
    { name: 'Client Secret Basic', value: 'client_secret_basic' },
    { name: 'Client Secret Post', value: 'client_secret_post' },
    { name: 'Client Secret JWT', value: 'client_secret_jwt' },
    { name: 'None (Public)', value: 'none' },
    // 'private_key_jwt', // do not enable until jwk_uri is ready
  ]

  public nonClientSecretAuthMethods: ClientAuthMethod[] = ['none']

  public uniqueResponseTypes = UNIQUE_RESPONSE_TYPES

  public grantTypes = GRANT_TYPES

  public client_id: string | null = null

  form = new FormGroup<TypedControls<ClientUpsert>>({
    client_id: new FormControl<string | null>(null, [Validators.required]),
    client_name: new FormControl<string | null>(null),
    redirect_uris: new FormControl<string[]>([]),
    client_secret: new FormControl<string | null>(null, [Validators.required, Validators.minLength(4)]),
    token_endpoint_auth_method: new FormControl<ClientUpsert['token_endpoint_auth_method']>('client_secret_basic'),
    response_types: new FormControl<ResponseType[]>(['code']),
    grant_types: new FormControl<itemIn<typeof GRANT_TYPES>[]>(['authorization_code', 'refresh_token']),
    post_logout_redirect_uri: new FormControl<ClientUpsert['post_logout_redirect_uri']>(null, [
      isValidWildcardRedirectControl,
      (c: AbstractControl<string | null>) => {
        const url = c.value
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const existing = this.form?.controls.redirect_uris.value
        if (!url || !existing?.length || !isValidWildcardRedirect(url)) {
          return null
        }
        const all = existing.concat([url])
        try {
          validateWildcardRedirects(all)
        } catch (e) {
          return {
            invalidRedirectUri: e instanceof Error ? e.message : 'A Redirect URL is invalid.',
          }
        }
        return null
      }]),
    skip_consent: new FormControl<boolean>(true),
    require_mfa: new FormControl<boolean>(false),
    logo_uri: new FormControl<string | null>(null, [isValidWebURLControl]),
    client_uri: new FormControl<string | null>(null, [isValidWebURLControl]),
    groups: new FormControl<ClientUpsert['groups']>([]),
  })

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
  }, [isValidWildcardRedirectControl, (c: AbstractControl<string>) => {
    const url = c.value
    const existing = this.form.controls.redirect_uris.value
    if (!url || !existing?.length || !isValidWildcardRedirect(url)) {
      return null
    }
    const all = existing.concat([url])
    try {
      validateWildcardRedirects(all)
    } catch (e) {
      return {
        invalid: e instanceof Error ? e.message : 'A Redirect URL is invalid.',
      }
    }
    return null
  }])

  responseTypeControl = new FormControl<itemIn<typeof UNIQUE_RESPONSE_TYPES>[]>(['code'], [(c) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (c.value?.length === 1 && c.value[0] === 'token') {
      return { invalid: 'This is an invalid Response Type selection.' }
    }
    return null
  }])

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
            client_name: client.client_name ?? null,
            client_secret: client.client_secret ?? null,
            redirect_uris: client.redirect_uris ?? [],
            token_endpoint_auth_method: client.token_endpoint_auth_method ?? 'client_secret_basic',
            response_types: client.response_types ?? ['code'],
            grant_types: client.grant_types ?? ['authorization_code', 'refresh_token'],
            post_logout_redirect_uri: client.post_logout_redirect_uris?.[0] ?? null,
            skip_consent: client['skip_consent'] ?? true,
            require_mfa: client['require_mfa'] ?? false,
            logo_uri: client.logo_uri ?? null,
            client_uri: client.client_uri ?? null,
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
        }
      } catch (e) {
        console.error(e)
        this.snackbarService.error('Error loading OIDC App Details.')
        this.form.disable()
      } finally {
        this.spinnerService.hide()
      }
    })

    this.responseTypeControl.valueChanges.subscribe((value) => {
      const response_types: ResponseType[] = []
      RESPONSE_TYPES.forEach((rt) => {
        if ((rt.split(' ') as ('code' | 'id_token' | 'token' | 'none')[]).every(rs => value?.includes(rs))) {
          response_types.push(rt)
        }
      })
      this.form.controls.response_types.setValue(response_types)
      this.form.controls.response_types.markAsDirty()
    })

    this.form.controls.token_endpoint_auth_method.valueChanges.subscribe((value) => {
      if (value && this.nonClientSecretAuthMethods.includes(value)) {
        this.form.controls.client_secret.removeValidators(Validators.required)
      } else {
        this.form.controls.client_secret.addValidators(Validators.required)
      }
      this.form.controls.client_secret.updateValueAndValidity()
    })
  }

  async submit() {
    try {
      this.spinnerService.show()

      if (this.client_id) {
        await this.adminService.updateClient({ ...this.form.getRawValue(), client_secret: this.form.value.client_secret || null })
      } else {
        await this.adminService.addClient({ ...this.form.getRawValue(), client_secret: this.form.value.client_secret || null })
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

      shownError ??= `Could not ${this.client_id ? 'update' : 'create'} app.`
      this.snackbarService.error(shownError)
    } finally {
      this.spinnerService.hide()
    }
  }

  deleteClient() {
    const dialogRef = this.dialog.open(ConfirmComponent, {
      data: {
        message: `Are you sure you want to delete this app?`,
        header: 'Delete',
      },
    })

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) {
        return
      }

      try {
        this.spinnerService.show()

        if (this.client_id) {
          await this.adminService.deleteClient(this.client_id)
        }

        this.snackbarService.message('App deleted.')
        await this.router.navigate(['/admin/clients'])
      } catch (_e) {
        this.snackbarService.error('Could not delete app.')
      } finally {
        this.spinnerService.hide()
      }
    })
  }

  generateClientID() {
    this.form.controls.client_id.setValue(generate({
      length: 16,
      numbers: true,
      strict: true,
    }))
    this.form.controls.client_id.markAsDirty()
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
    this.form.controls.redirect_uris.updateValueAndValidity()
    this.form.controls.post_logout_redirect_uri.markAsTouched()
    this.form.controls.post_logout_redirect_uri.updateValueAndValidity()
  }

  removeRedirectUrl(value: string) {
    this.form.controls.redirect_uris.setValue((this.form.controls.redirect_uris.value ?? []).filter(r => r !== value))
    this.form.controls.redirect_uris.markAsDirty()
    this.form.updateValueAndValidity()
    this.redirectUrlControl.updateValueAndValidity()
    this.form.controls.redirect_uris.markAsDirty()
    this.form.controls.redirect_uris.updateValueAndValidity()
    this.form.controls.post_logout_redirect_uri.markAsTouched()
    this.form.controls.post_logout_redirect_uri.updateValueAndValidity()
  }
}
