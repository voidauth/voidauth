import { type Routes } from '@angular/router'
import { HomeComponent } from './pages/home/home.component'
import { LoginComponent } from './pages/login/login.component'
import { RegistrationComponent } from './pages/registration/registration.component'
import { VerifySentComponent } from './pages/verify-email/verify-sent/verify-sent.component'
import { VerifyComponent } from './pages/verify-email/verify/verify.component'
import { ConsentComponent } from './pages/consent/consent.component'
import { REDIRECT_PATHS } from '@shared/constants'
import { LogoutComponent } from './pages/logout/logout.component'
import { UpsertClientComponent } from './pages/admin/clients/upsert-client/upsert-client.component'
import { ClientsComponent } from './pages/admin/clients/clients.component'
import { GroupsComponent } from './pages/admin/groups/groups.component'
import { GroupComponent } from './pages/admin/groups/group/group.component'
import { UsersComponent } from './pages/admin/users/users.component'
import { UserComponent } from './pages/admin/users/user/user.component'
import { InvitationsComponent } from './pages/admin/invitations/invitations.component'
import { InvitationComponent } from './pages/admin/invitations/invitation/invitation.component'
import { ApprovalRequiredComponent } from './pages/approval-required/approval-required.component'
import { ForgotPasswordComponent } from './pages/forgot-password/forgot-password.component'

export const routes: Routes = [
  { path: '', component: HomeComponent },

  { path: REDIRECT_PATHS.LOGIN, component: LoginComponent },

  { path: REDIRECT_PATHS.FORGOT_PASSWORD, component: ForgotPasswordComponent },

  { path: `${REDIRECT_PATHS.LOGOUT}/:secret`, component: LogoutComponent },

  { path: `${REDIRECT_PATHS.VERIFY_EMAIL}/:id/:challenge`, component: VerifyComponent },

  { path: `${REDIRECT_PATHS.VERIFICATION_EMAIL_SENT}/:id`, component: VerifySentComponent },

  { path: REDIRECT_PATHS.APPROVAL_REQUIRED, component: ApprovalRequiredComponent },

  { path: 'consent/:uid', component: ConsentComponent },

  { path: REDIRECT_PATHS.REGISTER, component: RegistrationComponent },
  { path: REDIRECT_PATHS.INVITE, component: RegistrationComponent },

  { path: 'admin/clients', component: ClientsComponent },
  { path: 'admin/client/:client_id', component: UpsertClientComponent },
  { path: `admin/client`, redirectTo: 'admin/client/', pathMatch: 'full' },

  { path: 'admin/groups', component: GroupsComponent },
  { path: 'admin/group/:id', component: GroupComponent },
  { path: `admin/group`, redirectTo: 'admin/group/', pathMatch: 'full' },

  { path: 'admin/users', component: UsersComponent },
  { path: 'admin/user/:id', component: UserComponent },

  { path: 'admin/invitations', component: InvitationsComponent },
  { path: 'admin/invitation/:id', component: InvitationComponent },
  { path: `admin/invitation`, redirectTo: 'admin/invitation/', pathMatch: 'full' },

  { path: '**', redirectTo: '', pathMatch: 'full' },
]
