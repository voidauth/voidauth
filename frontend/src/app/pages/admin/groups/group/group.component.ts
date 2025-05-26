import { CommonModule } from "@angular/common"
import { Component, inject } from "@angular/core"
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms"
import { MaterialModule } from "../../../../material-module"
import { ValidationErrorPipe } from "../../../../pipes/ValidationErrorPipe"
import { AdminService } from "../../../../services/admin.service"
import { ActivatedRoute, Router } from "@angular/router"
import { SnackbarService } from "../../../../services/snackbar.service"
import type { TypedFormGroup } from "../../clients/upsert-client/upsert-client.component"
import type { GroupUpsert } from "@shared/api-request/admin/GroupUpsert"
import type { MatAutocompleteSelectedEvent } from "@angular/material/autocomplete"
import type { UserWithoutPassword } from "@shared/api-response/UserDetails"
import type { GroupUsers } from "@shared/api-response/admin/GroupUsers"

@Component({
  selector: "app-group",
  imports: [
    CommonModule,
    MaterialModule,
    ValidationErrorPipe,
    ReactiveFormsModule,
  ],
  templateUrl: "./group.component.html",
  styleUrl: "./group.component.scss",
})
export class GroupComponent {
  public id: string | null = null
  public hasLoaded = false

  public users: UserWithoutPassword[] = []
  public unselectedUsers: UserWithoutPassword[] = []
  public selectableUsers: UserWithoutPassword[] = []
  userSelect = new FormControl<UserWithoutPassword | null>(null)

  public form = new FormGroup<TypedFormGroup<Omit<GroupUpsert, "id">>>({
    name: new FormControl<string>({
      value: "",
      disabled: false,
    }, [Validators.required]),
    users: new FormControl<GroupUsers["users"]>([], [Validators.required]),
  })

  private adminService = inject(AdminService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private snackbarService = inject(SnackbarService)

  ngOnInit() {
    this.route.paramMap.subscribe(async (params) => {
      try {
        const id = params.get("id")

        this.disablePage()

        if (id) {
          this.id = id
          const group = await this.adminService.group(this.id)
          this.form.reset({
            name: group.name,
            users: group.users.map((u) => {
              return { id: u.id, username: u.username }
            }),
          })
        }

        this.users = await this.adminService.users()
        this.userAutoFilter()

        this.enablePage()
        this.hasLoaded = true
      } catch (e) {
        console.error(e)
        this.snackbarService.error("Error loading group.")
      }
    })
  }

  disablePage() {
    this.form.disable()
  }

  enablePage() {
    this.form.enable()
  }

  userAutoFilter(value: string = "") {
    this.unselectedUsers = this.users.filter((u) => {
      return !this.form.controls.users.value?.find(gu => u.id === gu.id)
    })
    this.selectableUsers = this.unselectedUsers.filter((u) => {
      return u.username.toLowerCase().includes(value.toLowerCase())
        || u.email?.toLowerCase().includes(value.toLowerCase())
        || u.name?.toLowerCase().includes(value.toLowerCase())
    })
    if (this.unselectedUsers.length) {
      this.userSelect.enable()
    } else {
      this.userSelect.disable()
    }
  }

  addUser(event: MatAutocompleteSelectedEvent) {
    const value = event.option.value as UserWithoutPassword | null
    if (!value) {
      return
    }
    this.form.controls.users.setValue([{ id: value.id, username: value.username }]
      .concat(this.form.controls.users.value ?? []))
    this.form.controls.users.markAsDirty()
    this.userSelect.setValue(null)
    this.userAutoFilter()
  }

  removeUser(value: string) {
    this.form.controls.users.setValue((this.form.controls.users.value ?? []).filter(u => u.id !== value))
    this.form.controls.users.markAsDirty()
    this.userAutoFilter()
  }

  async submit() {
    try {
      this.disablePage()

      const group = await this.adminService.upsertGroup({ ...this.form.getRawValue(), id: this.id })
      this.snackbarService.show(`Group ${this.id ? "updated" : "created"}.`)

      this.id = group.id
      await this.router.navigate(["/admin/group", this.id], {
        replaceUrl: true,
      })
    } catch (_e) {
      this.snackbarService.error(`Could not ${this.id ? "update" : "create"} group.`)
    } finally {
      this.enablePage()
    }
  }

  async remove() {
    try {
      this.disablePage()

      if (this.id) {
        await this.adminService.deleteGroup(this.id)
      }

      this.snackbarService.show("Group deleted.")
      await this.router.navigate(["/admin/groups"])
    } catch (_e) {
      this.snackbarService.error("Could not delete group.")
    } finally {
      this.enablePage()
    }
  }
}
