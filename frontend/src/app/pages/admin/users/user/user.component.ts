import { CommonModule } from "@angular/common"
import { Component, inject } from "@angular/core"
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from "@angular/forms"
import { ActivatedRoute, Router } from "@angular/router"
import { MaterialModule } from "../../../../material-module"
import { ValidationErrorPipe } from "../../../../pipes/ValidationErrorPipe"
import { AdminService } from "../../../../services/admin.service"
import { SnackbarService } from "../../../../services/snackbar.service"
import type { TypedFormGroup } from "../../clients/upsert-client/upsert-client.component"
import type { UserUpdate } from "@shared/api-request/admin/UserUpdate"
import { MatAutocompleteSelectedEvent } from "@angular/material/autocomplete"
import { USERNAME_REGEX } from "@shared/constants"

@Component({
  selector: "app-user",
  imports: [
    CommonModule,
    MaterialModule,
    ValidationErrorPipe,
    ReactiveFormsModule,
  ],
  templateUrl: "./user.component.html",
  styleUrl: "./user.component.scss",
})
export class UserComponent {
  public id: string | null = null
  public hasLoaded = false

  public groups: string[] = []
  public unselectedGroups: string[] = []
  public selectableGroups: string[] = []
  groupSelect = new FormControl<string>({
    value: "",
    disabled: false,
  }, [])

  public form = new FormGroup<TypedFormGroup<Omit<UserUpdate, "id">>>({
    username: new FormControl<string>({
      value: "",
      disabled: false,
    }, [Validators.required, Validators.minLength(4), Validators.pattern(USERNAME_REGEX)]),
    email: new FormControl<string>({
      value: "",
      disabled: false,
    }, [Validators.required, Validators.email]),
    name: new FormControl<string | null>({
      value: null,
      disabled: false,
    }, [Validators.required]),
    emailVerified: new FormControl<boolean>({
      value: false,
      disabled: false,
    }, [Validators.required]),
    approved: new FormControl<boolean>({
      value: false,
      disabled: false,
    }, [Validators.required]),
    groups: new FormControl<string[]>({
      value: [],
      disabled: false,
    }, []),
  })

  private adminService = inject(AdminService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private snackbarService = inject(SnackbarService)

  ngOnInit() {
    this.route.paramMap.subscribe(async (params) => {
      try {
        this.id = params.get("id")

        this.disablePage()

        if (!this.id) {
          throw new Error("User ID missing.")
        }

        const user = await this.adminService.user(this.id)

        this.form.reset({
          username: user.username,
          name: user.name ?? null,
          email: user.email ?? "",
          emailVerified: user.emailVerified ?? false,
          approved: user.approved ?? false,
          groups: user.groups,
        })

        this.groups = (await this.adminService.groups()).map(g => g.name)
        this.groupAutoFilter()

        this.enablePage()
        this.hasLoaded = true
      } catch (e) {
        console.error(e)
        this.snackbarService.error("Error loading user.")
      }
    })
  }

  disablePage() {
    this.form.disable()
    this.groupSelect.disable()
  }

  enablePage() {
    this.form.enable()
    if (this.selectableGroups.length) {
      this.groupSelect.enable()
    } else {
      this.groupSelect.disable()
    }
  }

  groupAutoFilter(value: string = "") {
    this.unselectedGroups = this.groups.filter((g) => {
      return !this.form.controls.groups.value?.includes(g)
    })
    this.selectableGroups = this.unselectedGroups.filter((g) => {
      return g.toLowerCase().includes(value.toLowerCase())
    })
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
      this.disablePage()

      await this.adminService.updateUser({ ...this.form.getRawValue(), id: this.id })
      this.snackbarService.show("User updated.")
    } catch (_e) {
      this.snackbarService.error("Could not update user.")
    } finally {
      this.enablePage()
    }
  }

  async remove() {
    try {
      this.disablePage()

      if (this.id) {
        await this.adminService.deleteUser(this.id)
      }

      this.snackbarService.show("User deleted.")
      await this.router.navigate(["/admin/users"])
    } catch (_e) {
      this.snackbarService.error("Could not delete user.")
    } finally {
      this.enablePage()
    }
  }
}
