import { Component, inject, type OnInit } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators, type ValidatorFn } from '@angular/forms'
import { MAT_DIALOG_DATA } from '@angular/material/dialog'
import { MaterialModule } from '../../material-module'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'
import { AsyncPipe } from '@angular/common'
import { TranslatePipe } from '@ngx-translate/core'

export type OptionValueDialogData = {
  allowNew?: boolean
  newRegex?: RegExp
  newForbidden?: string[]
  header?: string
  optionLabel?: string
  availableOptions: string[]
  currentOption?: string
  currentValue?: string
}

export type OptionValueResult = {
  option: string
  value: string
} | null

@Component({
  selector: 'app-option-value-dialog',
  imports: [
    MaterialModule,
    ReactiveFormsModule,
    ValidationErrorPipe,
    AsyncPipe,
    TranslatePipe,
  ],
  templateUrl: './option-value-dialog.component.html',
  styleUrls: ['./option-value-dialog.component.scss'],
})
export class OptionValueDialogComponent implements OnInit {
  readonly data = inject<OptionValueDialogData>(MAT_DIALOG_DATA)

  public filteredOptions: string[] = []

  readonly form = new FormGroup({
    option: new FormControl<string | null>(null, [
      Validators.required,
      this.data.newRegex ? Validators.pattern(this.data.newRegex) : null,
      this.forbiddenOptionValidator(),
    ].filter((v): v is ValidatorFn => v !== null)),
    value: new FormControl<string | null>(null, [Validators.required]),
  })

  /**
   * Use getters for form fields, neat!
   */

  get option() {
    return this.form.controls.option
  }

  get value() {
    return this.form.controls.value
  }

  ngOnInit(): void {
    if (this.data.currentOption) {
      this.option.setValue(this.data.currentOption)
      this.value.setValue(this.data.currentValue ?? null)
      this.option.disable({ emitEvent: false })
    }
  }

  get optionValue() {
    const raw = this.form.getRawValue()
    return raw.option && raw.value ? raw : null
  }

  public updateFilteredOptions(value: string | null) {
    const filterValue = value?.trim().toLowerCase() ?? ''
    let options = this.data.availableOptions
    if (filterValue) {
      options = options.filter(option => option.toLowerCase().includes(filterValue))
    }

    this.filteredOptions = options.slice(0, 5)
  }

  private forbiddenOptionValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      if (!this.data.newForbidden?.length) {
        return null
      }
      const value = (control.value as string | null)?.trim()
      return value && this.data.newForbidden.map(f => f.trim().toLowerCase()).includes(value.toLowerCase())
        ? { forbiddenOption: 'Reserved or Forbidden.' }
        : null
    }
  }
}
