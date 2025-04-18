import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import environment from '../../environment/environment';
import type { ConfigResponse } from '@shared/api-response/ConfigResponse';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {

  constructor(private http: HttpClient) { }

  getCurrentHost() {
    const currentUri = new URL(window.location.href)
    let currentHost = `${currentUri.hostname}`
    if (currentUri.protocol) {
      currentHost = `${currentUri.protocol}//${currentHost}`
    }
    if (currentUri.port) {
      currentHost = `${currentHost}:${currentUri.port}`
    }
    return currentHost
  }

  async getConfig() {
    return firstValueFrom(this.http.get<ConfigResponse>(`${environment.apiUrl}/config`))
  }
}
