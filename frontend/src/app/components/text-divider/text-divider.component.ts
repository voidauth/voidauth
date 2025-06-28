import { Component, input } from "@angular/core"
import { MaterialModule } from "../../material-module"

@Component({
  selector: "app-text-divider",
  imports: [
    MaterialModule,
  ],
  templateUrl: "./text-divider.component.html",
  styleUrl: "./text-divider.component.scss",
})
export class TextDividerComponent {
  text = input.required<string>()
  disabled = input<boolean | string>()
}
