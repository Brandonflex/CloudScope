import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PlatformStatus } from '../models';

@Injectable({ providedIn: 'root' })
export class MetaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/meta`;

  readonly status = signal<PlatformStatus | null>(null);
  readonly demoMode = signal(false);

  loadStatus(): void {
    this.http.get<PlatformStatus>(this.baseUrl).subscribe({
      next: (status) => this.setStatus(status),
      error: () => this.setStatus(null)
    });
  }

  getStatus(): Observable<PlatformStatus> {
    return this.http
      .get<PlatformStatus>(this.baseUrl)
      .pipe(tap((status) => this.setStatus(status)));
  }

  loadDemo(): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/demo`, {});
  }

  private setStatus(status: PlatformStatus | null): void {
    // HttpClient's generic type does not validate a server response. Reject
    // unrelated JSON so a static host or proxy cannot be mistaken for the API.
    if (
      !status ||
      typeof status.demoMode !== 'boolean' ||
      !Array.isArray(status.configuredProviders) ||
      typeof status.resourceCount !== 'number' ||
      typeof status.relationshipCount !== 'number'
    ) {
      this.status.set(null);
      this.demoMode.set(false);
      return;
    }
    this.status.set(status);
    this.demoMode.set(status.demoMode);
  }
}
