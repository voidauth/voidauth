import { Component, inject, type OnInit } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators, type ValidatorFn } from '@angular/forms'
import { MAT_DIALOG_DATA } from '@angular/material/dialog'
import { MaterialModule } from '../../material-module'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'
import { AsyncPipe } from '@angular/common'
import { AdminService } from '../../services/admin.service'
import type { UserUpdate } from '@shared/api-request/admin/UserUpdate'
import type { CustomClaimsResponse } from '@shared/api-response/admin/CustomClaimResponse'
import { CUSTOM_CLAIM_CLAIM_REGEX, CUSTOM_CLAIM_SCOPE_REGEX, PROTECTED_CLAIMS, PROTECTED_SCOPES } from '@shared/constants'
import { stringCompare, type ItemIn } from '@shared/utils'

type CustomClaimEntry = ItemIn<UserUpdate['customClaims']>

interface CustomClaimDialogData {
  header?: string
  existingClaims?: CustomClaimEntry[]
  editClaim?: CustomClaimEntry
}

@Component({
  selector: 'app-custom-claim-dialog',
  imports: [
    MaterialModule,
    ReactiveFormsModule,
    ValidationErrorPipe,
    AsyncPipe,
  ],
  templateUrl: './custom-claim-dialog.component.html',
  styleUrls: ['./custom-claim-dialog.component.scss'],
})
export class CustomClaimDialogComponent implements OnInit {
  readonly data = inject<CustomClaimDialogData>(MAT_DIALOG_DATA)
  private readonly adminService = inject(AdminService)

  public availableScopes: string[] = []
  public availableClaims: string[] = []
  public filteredScopes: string[] = []
  public filteredClaims: string[] = []
  private customScopeClaims: CustomClaimsResponse[] = []
  private readonly protectedScopes = new Set<string>(PROTECTED_SCOPES)
  private readonly protectedClaims = new Set<string>(PROTECTED_CLAIMS)
  public isEditMode = false

  readonly form = new FormGroup({
    scope: new FormControl<string | null>(null, [
      Validators.required,
      Validators.pattern(CUSTOM_CLAIM_SCOPE_REGEX),
      this.protectedScopeValidator(),
    ]),
    claim: new FormControl<string | null>(null, [
      Validators.required,
      Validators.pattern(CUSTOM_CLAIM_CLAIM_REGEX),
      this.protectedClaimValidator(),
    ]),
    value: new FormControl<string | null>(null, [Validators.required]),
  })

  /**
   * Use getters for form fields, neat!
   */

  get scope() {
    return this.form.controls.scope
  }

  get claim() {
    return this.form.controls.claim
  }

  get value() {
    return this.form.controls.value
  }

  ngOnInit(): void {
    this.isEditMode = !!this.data.editClaim
    if (this.isEditMode && this.data.editClaim) {
      this.scope.setValue(this.data.editClaim.scope)
      this.claim.setValue(this.data.editClaim.claim)
      this.value.setValue(this.data.editClaim.value)
      this.scope.disable({ emitEvent: false })
      this.claim.disable({ emitEvent: false })
    }

    this.form.setValidators(this.customClaimUniqueValidator())
    this.form.updateValueAndValidity({ onlySelf: true })

    void this.loadCustomClaimOptions()

    this.scope.valueChanges.subscribe((value) => {
      this.updateScopeOptions(value)
      this.updateClaimOptions(this.claim.value)
    })

    this.claim.valueChanges.subscribe((value) => {
      this.updateClaimOptions(value)
    })
  }

  private customClaimUniqueValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const group = control as typeof this.form
      const scopeValue = group.get('scope')?.value
      const claimValue = group.get('claim')?.value
      if (!scopeValue || !claimValue) {
        return null
      }
      return this.claimAlreadyExists(scopeValue, claimValue)
        ? { duplicateClaim: 'Scope and claim combination already exists.' }
        : null
    }
  }

  private async loadCustomClaimOptions(): Promise<void> {
    try {
      const scopesClaims: CustomClaimsResponse[] = await this.adminService.customScopesClaims()
      this.customScopeClaims = scopesClaims
      this.availableScopes = scopesClaims.reduce<string[]>((scopes, scopeclaim) => {
        if (!scopes.includes(scopeclaim.scope)) {
          scopes.push(scopeclaim.scope)
        }
        return scopes
      }, []).filter(scope => !this.isProtectedScope(scope)).sort(stringCompare)

      this.availableClaims = scopesClaims.reduce<string[]>((claimsList, scopeclaim) => {
        if (scopeclaim.claim && !claimsList.includes(scopeclaim.claim)) {
          claimsList.push(scopeclaim.claim)
        }
        return claimsList
      }, []).filter(claim => !this.isProtectedClaim(claim)).sort(stringCompare)

      this.updateScopeOptions(this.scope.value)
      this.updateClaimOptions(this.claim.value)
    } catch {
      this.availableScopes = []
      this.availableClaims = []
      this.filteredScopes = []
      this.filteredClaims = []
    }
  }

  get claimValue() {
    const raw = this.form.getRawValue()
    return raw.claim && raw.scope && raw.value ? raw : null
  }

  public updateScopeOptions(value: string | null) {
    const filterValue = value?.trim().toLowerCase() ?? ''
    this.filteredScopes = filterValue
      ? this.availableScopes.filter(option => option.toLowerCase().includes(filterValue)).slice(0, 10)
      : this.availableScopes.slice(0, 10)
  }

  public updateClaimOptions(value: string | null) {
    const filterValue = value?.trim().toLowerCase() ?? ''
    const selectedScope = this.scope.value
    let baseOptions: string[]
    if (!selectedScope) {
      baseOptions = this.availableClaims
    } else {
      baseOptions = this.customScopeClaims
        .reduce<string[]>((claimsList, scopeclaim) => {
          if (scopeclaim.scope === selectedScope
            && scopeclaim.claim
            && !claimsList.includes(scopeclaim.claim)
            && !this.claimAlreadyExists(selectedScope, scopeclaim.claim)
            && !this.isProtectedClaim(scopeclaim.claim)) {
            claimsList.push(scopeclaim.claim)
          }
          return claimsList
        }, [])
    }

    if (filterValue) {
      baseOptions = baseOptions.filter(option => option.toLowerCase().includes(filterValue))
    }

    this.filteredClaims = baseOptions.slice(0, 10)
  }

  private protectedScopeValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const value = (control.value as string | null)?.trim()
      return value && this.isProtectedScope(value)
        ? { protectedScope: 'This scope is protected and cannot be used.' }
        : null
    }
  }

  private protectedClaimValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const value = (control.value as string | null)?.trim()
      return value && this.isProtectedClaim(value)
        ? { protectedClaim: 'This claim is protected and cannot be used.' }
        : null
    }
  }

  private isProtectedScope(scope: string): boolean {
    return this.protectedScopes.has(scope)
  }

  private isProtectedClaim(claim: string): boolean {
    return this.protectedClaims.has(claim)
  }

  private claimAlreadyExists(scope: string, claim: string): boolean {
    if (!this.data.existingClaims || this.data.editClaim) {
      return false
    }

    return this.data.existingClaims.some((ec) => {
      return ec.scope === scope && ec.claim === claim
    })
  }
}
