import { CommonModule } from '@angular/common';
import { Component, inject, type OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../material-module';
import { AuthService } from '../../../services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { SnackbarService } from '../../../services/snackbar.service';

@Component({
    selector: 'app-verify-sent',
    imports: [
        CommonModule,
        MaterialModule
    ],
    templateUrl: './verify-sent.component.html',
    styleUrl: './verify-sent.component.scss'
})
export class VerifySentComponent implements OnInit {
  sent: boolean = false
  userId: string | null = null

  private router = inject(Router)
  private activatedRoute = inject(ActivatedRoute)
  private authService = inject(AuthService)
  private snackbarService = inject(SnackbarService)

  constructor() {}

  async ngOnInit() {
    this.activatedRoute.queryParamMap.subscribe((queryParams) => {
      this.sent = queryParams.get('sent') === "true"
    })
    
    this.activatedRoute.paramMap.subscribe((paramMap) => {
      this.userId = paramMap.get("id")
    })
  }

  public async sendVerification() {
    try {
      if (!this.userId) {
        throw new Error("Missing User ID.")
      }
      await this.authService.sendEmailVerification({id: this.userId})
      this.router.navigate([], {
        queryParams: {
          sent: true
        },
        queryParamsHandling: "merge"
      })
      this.snackbarService.show("Verification Email Re-Sent.")
    } catch (e) {
      console.error(e)
      let error: string

      if (e instanceof HttpErrorResponse) {
        error ??= e.error?.message
      } else {
        error ??= (e as Error)?.message
      }

      error ??= "Something went wrong."
      this.snackbarService.error(error)
    }
  }
}
