import { Component, inject, type OnInit } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators, type ValidatorFn } from '@angular/forms'
import { MAT_DIALOG_DATA } from '@angular/material/dialog'
import { MaterialModule } from '../../material-module'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'
import { AsyncPipe } from '@angular/common'
import { AdminService } from '../../services/admin.service'
import type { UserUpdate } from '@shared/api-request/admin/UserUpdate'
import { CUSTOM_CLAIM_CLAIM_REGEX, PROTECTED_CLAIMS_SET } from '@shared/constants'
import { stringCompare, type ItemIn } from '@shared/utils'
import type { CustomClaim } from '@shared/db/CustomClaim'
import { TranslatePipe } from '@ngx-translate/core'

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
    TranslatePipe,
  ],
  templateUrl: './custom-claim-dialog.component.html',
  styleUrls: ['./custom-claim-dialog.component.scss'],
})
export class CustomClaimDialogComponent implements OnInit {
  readonly data = inject<CustomClaimDialogData>(MAT_DIALOG_DATA)
  private readonly adminService = inject(AdminService)

  public availableClaims: string[] = []
  public filteredClaims: string[] = []

  readonly form = new FormGroup({
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

  get claim() {
    return this.form.controls.claim
  }

  get value() {
    return this.form.controls.value
  }

  ngOnInit(): void {
    if (this.data.editClaim) {
      this.claim.setValue(this.data.editClaim.claim)
      this.value.setValue(this.data.editClaim.value)
      this.claim.disable({ emitEvent: false })
    }

    this.form.setValidators(this.customClaimUniqueValidator())
    this.form.updateValueAndValidity({ onlySelf: true })

    void this.loadCustomClaimOptions()

    this.claim.valueChanges.subscribe((value) => {
      this.updateClaimOptions(value)
    })
  }

  private customClaimUniqueValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const group = control as typeof this.form
      const claimValue = group.controls.claim.value
      if (!claimValue) {
        return null
      }
      return this.claimAlreadyExists(claimValue)
        ? { duplicateClaim: 'Claim already exists.' }
        : null
    }
  }

  private async loadCustomClaimOptions(): Promise<void> {
    try {
      const claims: CustomClaim[] = await this.adminService.customClaims()

      this.availableClaims = claims.map(c => c.claim)
        .filter(claim => !this.claimAlreadyExists(claim) && !this.isProtectedClaim(claim)).sort(stringCompare)

      this.updateClaimOptions(this.claim.value)
    } catch {
      this.availableClaims = []
      this.filteredClaims = []
    }
  }

  get claimValue() {
    const raw = this.form.getRawValue()
    return raw.claim && raw.value ? raw : null
  }

  public updateClaimOptions(value: string | null) {
    const filterValue = value?.trim().toLowerCase() ?? ''
    let options = this.availableClaims
    if (filterValue) {
      options = options.filter(option => option.toLowerCase().includes(filterValue))
    }

    this.filteredClaims = options.slice(0, 10)
  }

  private protectedClaimValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const value = (control.value as string | null)?.trim()
      return value && this.isProtectedClaim(value)
        ? { protectedClaim: 'This claim is protected and cannot be used.' }
        : null
    }
  }

  private isProtectedClaim(claim: string): boolean {
    return PROTECTED_CLAIMS_SET.has(claim)
  }

  private claimAlreadyExists(claim: string): boolean {
    if (!this.data.existingClaims || this.data.editClaim) {
      return false
    }

    return this.data.existingClaims.some((ec) => {
      return ec.claim === claim
    })
  }
}
