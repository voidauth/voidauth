import { Component, inject, type OnInit } from '@angular/core'
import { ConfigService } from '../../services/config.service'
import { FormGroup, FormControl, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { CommonModule } from '@angular/common'
import { MaterialModule } from '../../material-module'
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe'

@Component({
  selector: 'app-forgot-password',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    CommonModule,
    MaterialModule,
    ValidationErrorPipe,
  ],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent implements OnInit {
  emailActive: boolean = false

  public form = new FormGroup({
    email: new FormControl<string>({
      value: '',
      disabled: false,
    }, [Validators.required]),
  })

  configService = inject(ConfigService)

  async ngOnInit() {
    this.emailActive = (await this.configService.getConfig()).emailActive
  }

  send() {
    console.log('send')
  }
}
