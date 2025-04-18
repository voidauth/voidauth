import { CommonModule } from '@angular/common';
import { Component, type OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { MaterialModule } from '../../../material-module';

@Component({
    selector: 'app-verify',
    imports: [
        CommonModule,
        MaterialModule
    ],
    templateUrl: './verify.component.html',
    styleUrl: './verify.component.scss'
})
export class VerifyComponent implements OnInit {

  title: string = 'Verifying Email...'
  error: string | null = null
  userid?: string

  constructor(private activatedRoute: ActivatedRoute, private authService: AuthService) {}

  async ngOnInit() {
    const params = this.activatedRoute.snapshot.paramMap

    try {
      this.title = 'Verifying Email...'
      this.error = null

      const id = params.get("id")
      const challenge = params.get("challenge")

      if (!id || !challenge) {
        throw new Error("Invalid Verification.")
      }

      this.userid = id

      const redirect = await this.authService.verifyEmail({
        userId: this.userid,
        challenge: challenge
      })

      this.title = "Email Verified! Redirecting..."

      setTimeout(() => {
        location.assign(redirect.location)
      }, 2000)

    } catch (e) {
      console.error(e)

      if (e instanceof HttpErrorResponse) {
        this.error ||= e.error?.message
      } else {
        this.error ||= (e as Error)?.message
      }

      this.error ||= "Something went wrong."
      this.title = "Email Could Not Be Verified :("
    }
  }

  public async sendVerification() {
    this.title = "Sending New Verification..."
    this.error = null
    try {
      if (!this.userid) {
        throw new Error("Missing User ID.")
      }
      await this.authService.sendEmailVerification({id: this.userid})
    } catch (e) {
      console.error(e)

      if (e instanceof HttpErrorResponse) {
        this.error ??= e.error?.message
      } else {
        this.error ??= (e as Error)?.message
      }

      this.error ??= "Something went wrong."
    }
  }
}
