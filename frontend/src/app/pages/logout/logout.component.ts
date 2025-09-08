import { Component, inject, type OnInit } from '@angular/core'
import { MaterialModule } from '../../material-module'
import { ActivatedRoute } from '@angular/router'
import { SnackbarService } from '../../services/snackbar.service'
import { getCurrentHost } from '../../services/config.service'

@Component({
  selector: 'app-logout',
  imports: [
    MaterialModule,
  ],
  templateUrl: './logout.component.html',
  styleUrl: './logout.component.scss',
})
export class LogoutComponent implements OnInit {
  protected challenge?: string

  private route = inject(ActivatedRoute)
  private snackbarService = inject(SnackbarService)

  public host = getCurrentHost()

  history = window.history

  ngOnInit() {
    const params = this.route.snapshot.paramMap

    const challenge = params.get('challenge')
    if (challenge) {
      this.challenge = challenge
    } else {
      this.snackbarService.error('Invalid logout request.')
    }
  }
}
