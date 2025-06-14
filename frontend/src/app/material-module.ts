import { NgModule } from "@angular/core"
import { MatIconModule } from "@angular/material/icon"
import { MatButtonModule } from "@angular/material/button"
import { MatSidenavModule } from "@angular/material/sidenav"
import { MatToolbarModule } from "@angular/material/toolbar"
import { MAT_FORM_FIELD_DEFAULT_OPTIONS, MatFormFieldModule } from "@angular/material/form-field"
import { MatInputModule } from "@angular/material/input"
import { MatListModule } from "@angular/material/list"
import { MatCardModule } from "@angular/material/card"
import { MatPaginatorModule } from "@angular/material/paginator"
import { MatCheckboxModule } from "@angular/material/checkbox"
import { DragDropModule } from "@angular/cdk/drag-drop"
import { MatMenuModule } from "@angular/material/menu"
import { MatTabsModule } from "@angular/material/tabs"
import { MatTableModule } from "@angular/material/table"
import { MatSortModule } from "@angular/material/sort"
import { MatSelectModule } from "@angular/material/select"
import { MatAutocompleteModule } from "@angular/material/autocomplete"
import { MatTooltipModule } from "@angular/material/tooltip"
import { ClipboardModule } from "@angular/cdk/clipboard"
import { MatProgressBarModule } from "@angular/material/progress-bar"
import { NgxSpinnerModule } from "ngx-spinner"

@NgModule({
  exports: [
    NgxSpinnerModule,
    ClipboardModule,
    MatIconModule,
    MatButtonModule,
    MatSidenavModule,
    MatToolbarModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatCardModule,
    MatPaginatorModule,
    MatCheckboxModule,
    DragDropModule,
    MatMenuModule,
    MatTabsModule,
    MatTableModule,
    MatSortModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatTooltipModule,
    MatProgressBarModule,
  ],
  providers: [
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: "outline" } },
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class MaterialModule {}
