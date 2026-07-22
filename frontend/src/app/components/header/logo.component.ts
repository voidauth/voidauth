import { Component, signal, ChangeDetectionStrategy } from '@angular/core'

@Component({
  selector: 'app-logo',
  imports: [],
  template: `
    @if (logoFile()) {
      <img #logo [src]="logoFile()" alt="Logo" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    img {
      padding: 4px;
      height: 100%;
      object-fit: contain;
      object-position: left;
    }
  `,
})
export class LogoComponent {
  public logoFile = signal<string | undefined>(undefined)
  constructor() {
    const logoUri = document.querySelector('meta[name="logoUri"]')?.getAttribute('content')
    if (logoUri) {
      this.logoFile.set(logoUri)
    }
  }
}
