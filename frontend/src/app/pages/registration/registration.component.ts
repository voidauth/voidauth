import { Component, inject, type OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { AbstractControl, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material-module';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ValidationErrorPipe } from '../../pipes/ValidationErrorPipe';
import { SnackbarService } from '../../services/snackbar.service';
import { emptyOrMinLength } from '../../validators/validators';
import { USERNAME_REGEX } from '@shared/constants';
import type { InvitationDetails } from '@shared/api-response/InvitationDetails';
@Component({
    selector: 'app-registration',
    templateUrl: './registration.component.html',
    styleUrls: ['./registration.component.scss'],
    imports: [
        ReactiveFormsModule,
        FormsModule,
        MaterialModule,
        CommonModule,
        ValidationErrorPipe,
        RouterLink,
    ]
})
export class RegistrationComponent implements OnInit {

  public form = new FormGroup({
    username: new FormControl<string>({
      value: '',
      disabled: false
    }, [Validators.required, Validators.minLength(4), Validators.pattern(USERNAME_REGEX)]),
  
    email: new FormControl<string>({
      value: '',
      disabled: false
    }, [Validators.required, Validators.email]),

    name: new FormControl<string | null>({
      value: null,
      disabled: false
    }, [emptyOrMinLength(4)]),
  
    password: new FormControl<string>({
      value: '',
      disabled: false
    }, [Validators.required, Validators.minLength(8)]),
  })

  public invitation?: InvitationDetails

  public pwdShow: boolean = false

  private snackbarService = inject(SnackbarService)
  private authService = inject(AuthService)
  private route = inject(ActivatedRoute)

  constructor() {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(async (queryParams) => {
      const inviteId = queryParams.get('invite')
      const challenge = queryParams.get('challenge')

      if (inviteId && challenge) {
        this.invitation = await this.authService.getInviteDetails(inviteId, challenge)
        
        if (this.invitation.username) {
          this.form.controls.username.reset(this.invitation.username)
          this.form.controls.username.disable()
        }

        if (this.invitation.email) {
          this.form.controls.email.reset(this.invitation.email)
          this.form.controls.email.disable()
        }

        if (this.invitation.name) {
          this.form.controls.name.reset(this.invitation.name)
          this.form.controls.name.disable()
        }
      }
    })
  }

  async register() {
    try {
      const redirect = await this.authService.register({
        ...this.form.getRawValue(),
        inviteId: this.invitation?.id,
        challenge: this.invitation?.challenge
      })
      location.assign(redirect.location)
    } catch (e) {
      console.error(e)

      let shownError: string
      if (e instanceof HttpErrorResponse) {
        shownError ??= e.error?.message
      } else {
        shownError ??= (e as Error)?.message
      }

      shownError ??= "Something went wrong."
      this.snackbarService.error(shownError)
    }
  }
}