import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import type { ClientUpsert } from '@shared/api-request/admin/ClientUpsert'
import type { ClientMetadata } from 'oidc-provider'
import type { Nullable } from '@shared/utils'
import type { UserUpdate } from '@shared/api-request/admin/UserUpdate'
import type { GroupUpsert } from '@shared/api-request/admin/GroupUpsert'
import type { InvitationUpsert } from '@shared/api-request/admin/InvitationUpsert'
import type { UserDetails, UserWithAdminIndicator } from '@shared/api-response/UserDetails'
import { type InvitationDetails } from '@shared/api-response/InvitationDetails'
import type { Group } from '@shared/db/Group'
import type { Invitation } from '@shared/db/Invitation'
import { ConfigService } from './config.service'
import { REDIRECT_PATHS } from '@shared/constants'
import type { GroupUsers } from '@shared/api-response/admin/GroupUsers'
import type { ProxyAuthUpsert } from '@shared/api-request/admin/ProxyAuthUpsert'
import type { ProxyAuthResponse } from '@shared/api-response/admin/ProxyAuthResponse'
import type { PasswordResetUser } from '@shared/api-response/admin/PasswordResetUser'
import type { PasswordResetCreate } from '@shared/api-request/admin/PasswordResetCreate'

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private configService = inject(ConfigService)
  private http = inject(HttpClient)

  getInviteLink(domain: string, id: string, challenge: string) {
    const query = `invite=${id}&challenge=${challenge}`
    return `${domain}/${REDIRECT_PATHS.INVITE}?${query}`
  }

  getPasswordResetLink(domain: string, id: string, challenge: string) {
    const query = `id=${id}&challenge=${challenge}`
    return `${domain}/${REDIRECT_PATHS.RESET_PASSWORD}?${query}`
  }

  async clients() {
    return firstValueFrom(this.http.get<ClientMetadata[]>('/api/admin/clients'))
  }

  async client(client_id: string) {
    return firstValueFrom(this.http.get<ClientMetadata>(`/api/admin/client/${client_id}`))
  }

  async addClient(client: Nullable<ClientUpsert>) {
    return firstValueFrom(this.http.post<null>('/api/admin/client', client))
  }

  async updateClient(client: Nullable<ClientUpsert>) {
    return firstValueFrom(this.http.patch<null>('/api/admin/client', client))
  }

  async deleteClient(client_id: string) {
    return firstValueFrom(this.http.delete<null>(`/api/admin/client/${client_id}`))
  }

  async proxyAuths() {
    return firstValueFrom(this.http.get<ProxyAuthResponse[]>('/api/admin/proxyauths'))
  }

  async proxyAuth(proxyauth_id: string) {
    return firstValueFrom(this.http.get<ProxyAuthResponse>(`/api/admin/proxyauth/${proxyauth_id}`))
  }

  async upsertProxyAuth(proxyAuth: Nullable<ProxyAuthUpsert>) {
    return firstValueFrom(this.http.post<ProxyAuthResponse>('/api/admin/proxyauth', proxyAuth))
  }

  async deleteProxyAuth(proxyauth_id: string) {
    return firstValueFrom(this.http.delete<null>(`/api/admin/proxyauth/${proxyauth_id}`))
  }

  async groups() {
    return firstValueFrom(this.http.get<Group[]>('/api/admin/groups'))
  }

  async group(id: string) {
    return firstValueFrom(this.http.get<GroupUsers>(`/api/admin/group/${id}`))
  }

  async upsertGroup(group: Nullable<GroupUpsert>) {
    return firstValueFrom(this.http.post<{ id: string }>('/api/admin/group', group))
  }

  async deleteGroup(id: string) {
    return firstValueFrom(this.http.delete<null>(`/api/admin/group/${id}`))
  }

  async users(searchTerm?: string | null) {
    return firstValueFrom(this.http.get<UserWithAdminIndicator[]>(`/api/admin/users${searchTerm ? '/' + searchTerm : ''}`))
  }

  async user(id: string) {
    return firstValueFrom(this.http.get<UserDetails>(`/api/admin/user/${id}`))
  }

  async updateUser(user: Nullable<UserUpdate>) {
    return firstValueFrom(this.http.patch<null>('/api/admin/user', user))
  }

  async deleteUser(id: string) {
    return firstValueFrom(this.http.delete<null>(`/api/admin/user/${id}`))
  }

  async signOutUser(id: string) {
    return firstValueFrom(this.http.post<null>(`/api/admin/user/signout/${id}`, null))
  }

  async approveUsers(ids: string[]) {
    return firstValueFrom(this.http.patch<null>('/api/admin/users/approve', { users: ids }))
  }

  async deleteUsers(ids: string[]) {
    return firstValueFrom(this.http.post<null>('/api/admin/users/delete', { users: ids }))
  }

  async invitations() {
    return firstValueFrom(this.http.get<Invitation[]>('/api/admin/invitations'))
  }

  async invitation(id: string) {
    return firstValueFrom(this.http.get<InvitationDetails>(`/api/admin/invitation/${id}`))
  }

  async upsertInvitation(invitation: Nullable<InvitationUpsert>) {
    return firstValueFrom(this.http.post<InvitationDetails>('/api/admin/invitation', invitation))
  }

  async deleteInvitation(id: string) {
    return firstValueFrom(this.http.delete<null>(`/api/admin/invitation/${id}`))
  }

  async sendInvitation(id: string) {
    return firstValueFrom(this.http.post<null>(`/api/admin/send_invitation/${id}`, null))
  }

  async passwordResets() {
    return firstValueFrom(this.http.get<PasswordResetUser[]>('/api/admin/passwordresets'))
  }

  async createPasswordReset(passwordReset: PasswordResetCreate) {
    return firstValueFrom(this.http.post<PasswordResetUser>('/api/admin/passwordreset', passwordReset))
  }

  async deletePasswordReset(id: string) {
    return firstValueFrom(this.http.delete<null>(`/api/admin/passwordreset/${id}`))
  }

  async sendPasswordReset(id: string) {
    return firstValueFrom(this.http.post<null>(`/api/admin/send_passwordreset/${id}`, null))
  }
}
