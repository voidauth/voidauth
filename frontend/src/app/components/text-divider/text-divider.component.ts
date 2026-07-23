import { Component, input, ChangeDetectionStrategy } from '@angular/core'
import { MaterialModule } from '../../material-module'

@Component({
  selector: 'app-text-divider',
  imports: [MaterialModule],
  templateUrl: './text-divider.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './text-divider.component.scss',
})
export class TextDividerComponent {
  text = input.required<string>()
  disabled = input<boolean | string>()
}
