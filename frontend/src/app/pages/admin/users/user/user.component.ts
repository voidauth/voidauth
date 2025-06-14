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
import type { UserDetails } from "@shared/api-response/UserDetails"
import { UserService } from "../../../../services/user.service"
import { SpinnerService } from "../../../../services/spinner.service"

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
  public me?: UserDetails
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
    }, [Validators.email]),
    name: new FormControl<string | null>({
      value: null,
      disabled: false,
    }, [Validators.minLength(4)]),
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
  private userService = inject(UserService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private snackbarService = inject(SnackbarService)
  private spinnerService = inject(SpinnerService)

  ngOnInit() {
    this.route.paramMap.subscribe(async (params) => {
      try {
        this.spinnerService.show()

        this.me = await this.userService.getMyUser()

        this.id = params.get("id")

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

        this.hasLoaded = true
      } catch (e) {
        console.error(e)
        this.snackbarService.error("Error loading user.")
      } finally {
        this.spinnerService.hide()
      }
    })
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
      this.spinnerService.show()

      await this.adminService.updateUser({ ...this.form.getRawValue(), id: this.id })
      this.snackbarService.show("User updated.")
    } catch (_e) {
      this.snackbarService.error("Could not update user.")
    } finally {
      this.spinnerService.hide()
    }
  }

  async remove() {
    try {
      this.spinnerService.show()

      if (this.id) {
        await this.adminService.deleteUser(this.id)
      }

      this.snackbarService.show("User deleted.")
      await this.router.navigate(["/admin/users"])
    } catch (_e) {
      this.snackbarService.error("Could not delete user.")
    } finally {
      this.spinnerService.hide()
    }
  }
}
