import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import environment from '../../environment/environment';
import type { ClientUpsert } from '@shared/api-request/admin/ClientUpsert';
import type { ClientMetadata } from 'oidc-provider';
import type { Nullable } from '@shared/utils';
import type { UserUpdate } from '@shared/api-request/admin/UserUpdate'
import type { GroupUpsert } from '@shared/api-request/admin/GroupUpsert'
import type { InvitationUpsert } from '@shared/api-request/admin/InvitationUpsert'
import type { UserDetails, UserWithoutPassword } from '@shared/api-response/UserDetails';
import { type InvitationDetails } from '@shared/api-response/InvitationDetails'
import type { Group } from '@shared/db/Group';
import type { Invitation } from '@shared/db/Invitation';
import { ConfigService } from './config.service';
import { REDIRECT_PATHS } from '@shared/constants';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private configService = inject(ConfigService)
  private http = inject(HttpClient)

  constructor() { }

  getInviteLink(id: string, challenge: string) {
    const query = `invite=${id}&challenge=${challenge}`
    return `${this.configService.getCurrentHost()}/${REDIRECT_PATHS.INVITE}?${query}`
  }

  async clients() {
    return firstValueFrom(this.http.get<ClientMetadata[]>(`${environment.apiUrl}/admin/clients`));
  }

  async client(client_id: string) {
    return firstValueFrom(this.http.get<ClientMetadata>(`${environment.apiUrl}/admin/client/${client_id}`));
  }

  async addClient(client: Nullable<ClientUpsert>) {
    return firstValueFrom(this.http.post<void>(`${environment.apiUrl}/admin/client`, client));
  }

  async updateClient(client: Nullable<ClientUpsert>) {
    return firstValueFrom(this.http.patch<void>(`${environment.apiUrl}/admin/client`, client));
  }

  async deleteClient(client_id: string) {
    return firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/admin/client/${client_id}`));
  }


  async groups() {
    return firstValueFrom(this.http.get<Group[]>(`${environment.apiUrl}/admin/groups`));
  }

  async group(id: string) {
    return firstValueFrom(this.http.get<Group>(`${environment.apiUrl}/admin/group/${id}`));
  }

  async upsertGroup(group: Nullable<GroupUpsert>) {
    return firstValueFrom(this.http.post<Group>(`${environment.apiUrl}/admin/group`, group));
  }

  async deleteGroup(id: string) {
    return firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/admin/group/${id}`));
  }


  async users() {
    return firstValueFrom(this.http.get<UserWithoutPassword[]>(`${environment.apiUrl}/admin/users`));
  }

  async user(id: string) {
    return firstValueFrom(this.http.get<UserDetails>(`${environment.apiUrl}/admin/user/${id}`));
  }

  async updateUser(user: Nullable<UserUpdate>) {
    return firstValueFrom(this.http.patch<void>(`${environment.apiUrl}/admin/user`, user));
  }

  async deleteUser(id: string) {
    return firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/admin/user/${id}`));
  }

  async invitations() {
    return firstValueFrom(this.http.get<Invitation[]>(`${environment.apiUrl}/admin/invitations`));
  }

  async invitation(id: string) {
    return firstValueFrom(this.http.get<InvitationDetails>(`${environment.apiUrl}/admin/invitation/${id}`));
  }

  async upsertInvitation(invitation: Nullable<InvitationUpsert>) {
    return firstValueFrom(this.http.post<InvitationDetails>(`${environment.apiUrl}/admin/invitation`, invitation));
  }

  async deleteInvitation(id: string) {
    return firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/admin/invitation/${id}`));
  }

  async sendInvitation(id: string) {
    return firstValueFrom(this.http.post<void>(`${environment.apiUrl}/admin/send_invitation/${id}`, null))
  }
}
