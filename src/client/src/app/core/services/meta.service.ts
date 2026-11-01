import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PlatformStatus } from '../models';

@Injectable({ providedIn: 'root' })
export class MetaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/meta`;

  readonly status = signal<PlatformStatus | null>(null);
  readonly demoMode = signal(false);
  readonly liveLoginRequired = signal(false);
  /** True once the API has responded or failed; avoids showing demo UI while offline. */
  readonly statusResolved = signal(false);

  loadStatus(): void {
    this.http.get<PlatformStatus>(this.baseUrl).subscribe({
      next: (status) => this.setStatus(status),
      error: (error: unknown) => this.handleError(error)
    });
  }

  getStatus(): Observable<PlatformStatus> {
    return this.http.get<PlatformStatus>(this.baseUrl).pipe(
      tap((status) => this.setStatus(status)),
      catchError((error: unknown) => {
        this.handleError(error);
        return throwError(() => error);
      })
    );
  }

  loadDemo(): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/demo`, {});
  }

  private handleError(error: unknown): void {
    this.setStatus(null);
    this.liveLoginRequired.set(error instanceof HttpErrorResponse && error.status === 401);
  }

  private setStatus(status: PlatformStatus | null): void {
    this.statusResolved.set(true);
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
    this.liveLoginRequired.set(false);
  }
}
