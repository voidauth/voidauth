import { CommonModule } from '@angular/common'
import { Component, inject, input, model, type OnInit } from '@angular/core'
import { ReactiveFormsModule, type FormControl } from '@angular/forms'
import { zxcvbnOptions, zxcvbn } from '@zxcvbn-ts/core'
import { debounceTime } from 'rxjs'
import { MaterialModule } from '../../material-module'
import { ConfigService } from '../../services/config.service'

@Component({
  selector: 'app-new-password-input',
  imports: [
    ReactiveFormsModule,
    CommonModule,
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

  async ngOnInit(): Promise<void> {
    void this.configService.getConfig().then((c) => {
      this.minScore = c.zxcvbnMin + 1
    })

    const options = await this.loadOptions()
    zxcvbnOptions.setOptions(options)

    this.password().valueChanges.pipe(debounceTime(300)).subscribe((v) => {
      if (!v) {
        this.score = 0
      } else {
        this.score = zxcvbn(v).score + 1
      }

      if (this.score === 0) {
        this.message = 'lets make a strong password 😊'
        this.meterColor = ''
      } else if (this.score === 1) {
        this.message = 'very weak!! ❌❌'
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
      if (this.score < this.minScore) {
        c.setErrors({ ...c.errors, strength: { min: this.minScore, current: this.score } })
      } else {
        if (c.errors) {
          const { strength, ...errors } = c.errors
          c.setErrors(errors)
        }
      }
    })
  }

  async loadOptions() {
    const zxcvbnCommonPackage = await import('@zxcvbn-ts/language-common')
    const zxcvbnEnPackage = await import('@zxcvbn-ts/language-en')

    return {
      // recommended
      dictionary: {
        ...zxcvbnCommonPackage.dictionary,
        ...zxcvbnEnPackage.dictionary,
      },
      // recommended
      graphs: zxcvbnCommonPackage.adjacencyGraphs,
      // recommended
      useLevenshteinDistance: true,
      // // optional
      // translations: zxcvbnEnPackage.translations,
    }
  }

  togglePwdShow() {
    this.pwdShow.update((v) => {
      return !v
    })
  }
}
