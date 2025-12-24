/* eslint-disable @stylistic/max-len */
import { type Routes } from '@angular/router'

import { REDIRECT_PATHS } from '@shared/constants'

import { PrivilegedGuard } from './guards/privileged.guard'
import { isAdminGuard } from './guards/is-admin.guard'

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent), canActivate: [PrivilegedGuard] },

  { path: REDIRECT_PATHS.LOGIN, loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },

  { path: REDIRECT_PATHS.MFA, loadComponent: () => import('./pages/mfa/mfa.component').then(m => m.MfaComponent) },

  { path: REDIRECT_PATHS.FORGOT_PASSWORD, loadComponent: () => import('./pages/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },

  { path: REDIRECT_PATHS.RESET_PASSWORD, loadComponent: () => import('./pages/reset-password/reset-password.component').then(m => m.ResetPasswordComponent) },

  { path: `${REDIRECT_PATHS.LOGOUT}/:challenge`, loadComponent: () => import('./pages/logout/logout.component').then(m => m.LogoutComponent) },
  { path: REDIRECT_PATHS.LOGOUT, redirectTo: `${REDIRECT_PATHS.LOGOUT}/`, pathMatch: 'full' },

  { path: `${REDIRECT_PATHS.VERIFY_EMAIL}/:id/:challenge`, loadComponent: () => import('./pages/verify-email/verify/verify.component').then(m => m.VerifyComponent) },

  { path: `${REDIRECT_PATHS.VERIFICATION_EMAIL_SENT}/:id`, loadComponent: () => import('./pages/verify-email/verify-sent/verify-sent.component').then(m => m.VerifySentComponent) },

  { path: REDIRECT_PATHS.APPROVAL_REQUIRED, loadComponent: () => import('./pages/approval-required/approval-required.component').then(m => m.ApprovalRequiredComponent) },

  { path: 'consent/:uid', loadComponent: () => import('./pages/consent/consent.component').then(m => m.ConsentComponent), canActivate: [PrivilegedGuard] },

  { path: REDIRECT_PATHS.REGISTER, loadComponent: () => import('./pages/registration/registration.component').then(m => m.RegistrationComponent) },
  { path: REDIRECT_PATHS.INVITE, loadComponent: () => import('./pages/registration/registration.component').then(m => m.RegistrationComponent) },

  { path: 'admin/clients', loadComponent: () => import('./pages/admin/clients/clients.component').then(m => m.ClientsComponent), canActivate: [isAdminGuard] },
  { path: 'admin/client/:client_id', loadComponent: () => import('./pages/admin/clients/upsert-client/upsert-client.component').then(m => m.UpsertClientComponent), canActivate: [isAdminGuard] },
  { path: 'admin/client', redirectTo: 'admin/client/', pathMatch: 'full' },

  { path: 'admin/domains', loadComponent: () => import('./pages/admin/domains/domains.component').then(m => m.DomainsComponent), canActivate: [isAdminGuard] },
  { path: 'admin/domain/:id', loadComponent: () => import('./pages/admin/domains/domain/domain.component').then(m => m.DomainComponent), canActivate: [isAdminGuard] },
  { path: 'admin/domain', redirectTo: 'admin/domain/', pathMatch: 'full' },

  { path: 'admin/groups', loadComponent: () => import('./pages/admin/groups/groups.component').then(m => m.GroupsComponent), canActivate: [isAdminGuard] },
  { path: 'admin/group/:id', loadComponent: () => import('./pages/admin/groups/group/group.component').then(m => m.GroupComponent), canActivate: [isAdminGuard] },
  { path: 'admin/group', redirectTo: 'admin/group/', pathMatch: 'full' },

  { path: 'admin/users', loadComponent: () => import('./pages/admin/users/users.component').then(m => m.UsersComponent), canActivate: [isAdminGuard] },
  { path: 'admin/user/:id', loadComponent: () => import('./pages/admin/users/user/user.component').then(m => m.UserComponent), canActivate: [isAdminGuard] },

  { path: 'admin/invitations', loadComponent: () => import('./pages/admin/invitations/invitations.component').then(m => m.InvitationsComponent), canActivate: [isAdminGuard] },
  { path: 'admin/invitation/:id', loadComponent: () => import('./pages/admin/invitations/invitation/invitation.component').then(m => m.InvitationComponent), canActivate: [isAdminGuard] },
  { path: 'admin/invitation', redirectTo: 'admin/invitation/', pathMatch: 'full' },

  { path: 'admin/passwordresets', loadComponent: () => import('./pages/admin/password-resets/password-resets.component').then(m => m.PasswordResetsComponent), canActivate: [isAdminGuard] },

  { path: 'admin/emails', loadComponent: () => import('./pages/admin/emails/emails.component').then(m => m.EmailsComponent), canActivate: [isAdminGuard] },

  { path: '**', redirectTo: '', pathMatch: 'full' },
]
