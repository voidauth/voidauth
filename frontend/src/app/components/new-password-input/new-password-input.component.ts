import { Component, inject, input, model, type OnInit } from '@angular/core'
import { ReactiveFormsModule, type FormControl } from '@angular/forms'
import { catchError, debounceTime, distinctUntilChanged, from, map, of, switchMap } from 'rxjs'
import { MaterialModule } from '../../material-module'
import { ConfigService } from '../../services/config.service'
import { UserService } from '../../services/user.service'

@Component({
  selector: 'app-new-password-input',
  imports: [
    ReactiveFormsModule,
    MaterialModule,
  ],
  templateUrl: './new-password-input.component.html',
  styleUrl: './new-password-input.component.scss',
})
export class NewPasswordInputComponent implements OnInit {
  password = input.required<FormControl<string | null>>()
  pwdShow = model<boolean>(false)

  score: number = 0
  message: string = 'Lets make a strong password 😊'
  meterColor: string = ''

  minScore = 3

  configService = inject(ConfigService)
  userService = inject(UserService)

  ngOnInit() {
    void this.configService.getConfig().then((c) => {
      this.minScore = c.zxcvbnMin + 1
    })

    this.password().valueChanges.pipe(
      distinctUntilChanged(),
      map((value) => {
        const c = this.password()
        c.setErrors({ ...c.errors, strength: { min: this.minScore, current: 'pending' } })
        return value
      }),
      debounceTime(500),
      switchMap((v) => {
        if (!v) {
          return of({ score: -1 })
        }
        return from(this.userService.passwordStrength(v)).pipe(
          catchError(() => of({ score: -1 })),
        )
      }),
    ).subscribe(({ score }) => {
      this.score = score + 1

      if (this.score === 0) {
        this.message = 'lets make a strong password 😊'
        this.meterColor = ''
      } else if (this.score === 1) {
        this.message = 'very weak!! 💀'
        this.meterColor = 'red'
      } else if (this.score === 2) {
        this.message = 'too weak! ❌'
        this.meterColor = 'orange'
      } else if (this.score === 3) {
        this.message = 'ok, but could be better... 😐'
        this.meterColor = 'yellow'
      } else if (this.score === 4) {
        this.message = `good${this.minScore > 4 ? ', a bit more' : ''}! 👍`
        this.meterColor = 'green'
      } else if (this.score === 5) {
        this.message = 'legendary strength! 💪'
        this.meterColor = 'legendary'
      }

      const c = this.password()
      if (this.score && this.score < this.minScore) {
        c.setErrors({ ...c.errors, strength: { min: this.minScore, current: this.score } })
      } else {
        if (c.errors) {
          // const { strength, ...errors } = c.errors
          c.setErrors(null)
        }
      }
    })
  }

  togglePwdShow() {
    this.pwdShow.update((v) => {
      return !v
    })
  }
}
