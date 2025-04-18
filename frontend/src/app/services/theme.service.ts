import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {

  private lightMode = false;
  private lightClass = 'light'

  isLightMode() {
    return this.lightMode;
  }

  setLightMode(isLightMode: boolean) {
    this.lightMode = isLightMode;
    if (isLightMode) {
      document.body.classList.add(this.lightClass);
    } else {
      document.body.classList.remove(this.lightClass);
    }
  }
}
