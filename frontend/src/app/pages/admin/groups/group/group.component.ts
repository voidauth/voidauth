import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialModule } from '../../../../material-module';
import { ValidationErrorPipe } from '../../../../pipes/ValidationErrorPipe';
import { AdminService } from '../../../../services/admin.service';
import { ActivatedRoute, Router } from '@angular/router';
import { SnackbarService } from '../../../../services/snackbar.service';
import type { TypedFormGroup } from '../../clients/upsert-client/upsert-client.component';
import type { GroupUpsert } from '@shared/api-request/admin/GroupUpsert';

@Component({
  selector: 'app-group',
  imports: [
    CommonModule,
    MaterialModule,
    ValidationErrorPipe,
    ReactiveFormsModule
  ],
  templateUrl: './group.component.html',
  styleUrl: './group.component.scss'
})
export class GroupComponent {

  public id: string | null = null
  public hasLoaded = false

  public form = new FormGroup<TypedFormGroup<Omit<GroupUpsert, "id">>>({
      name: new FormControl<string>({
        value: '',
        disabled: false
      }, [Validators.required]),
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
            name: group.name ?? "",
          })
        }

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

  async submit() {
    try {
      this.disablePage()

      const group = await this.adminService.upsertGroup({...this.form.getRawValue(), id: this.id})
      this.snackbarService.show(`Group ${this.id ? "updated" : "created"}.`)
      
      this.id = group.id
      this.router.navigate(["/admin/group", this.id], {
        replaceUrl: true
      })
    } catch (e) {
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
      
      this.snackbarService.show(`Group deleted.`)
      this.router.navigate(["/admin/groups"])
    } catch (e) {
      this.snackbarService.error(`Could not delete group.`)
    } finally {
      this.enablePage()
    }
  }
}
