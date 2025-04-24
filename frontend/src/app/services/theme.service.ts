import { Injectable } from '@angular/core';

export type ThemeMode = "system" | "dark" | "light"

@Injectable({
  providedIn: 'root'
})
export class ThemeService {

  private _themeMode: ThemeMode = "system"

  constructor() {
    this.themeMode = localStorage.getItem("theme_mode") as ThemeMode | null ?? this.getPreferredColorScheme()
  }

  get themeMode() {
    return this._themeMode
  };

  set themeMode(mode: ThemeMode) {
    this._themeMode = mode
    localStorage.setItem('theme_mode', mode)
    document.body.classList.toggle("dark", mode === "dark")
    document.body.classList.toggle("light", mode === "light")
  }

  private getPreferredColorScheme(): ThemeMode {
    if (window.matchMedia) {
      if(window.matchMedia('(prefers-color-scheme: dark)').matches){
        return 'dark';
      } else {
        return 'light';
      }
    }
    return 'light';
  }
}
