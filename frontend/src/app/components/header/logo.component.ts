import { Component } from '@angular/core'

@Component({
  selector: 'app-logo',
  imports: [],
  template: `
  <img
      #logo
      src="logo.svg"
      (error)="
        logo.src.includes('logo.svg')
          ? (logo.src = 'logo.png')
          : logo.src.includes('logo.png')
            ? (logo.src = 'favicon.svg')
            : logo.src.includes('favicon.svg')
              ? (logo.src = 'favicon.png')
              : logo.src.includes('favicon.png')
                ? (logo.src = 'apple-touch-icon.png')
                : null
      "
    />
  `,
  styles: `
  img {
    padding: 4px;
    height: 100%;
    object-fit: contain;
    object-position: left;
  }
  `,
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class LogoComponent { }
