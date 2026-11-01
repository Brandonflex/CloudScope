import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { CloudResource, PagedResult } from '../../core/models';
import { MetaService } from '../../core/services/meta.service';

@Component({
  selector: 'app-live-inventory',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <header>
        <div>
          <span class="eyebrow">CLOUDSCOPE / AZURE</span>
          <h1>Real Azure inventory</h1>
        </div>
        @if (!meta.liveLoginRequired()) {
          <button type="button" (click)="logout()">Sign out</button>
        }
      </header>
      @if (meta.liveLoginRequired()) {
        <section class="panel">
          <h2>Sign in to view your inventory</h2>
          <p>
            Access is restricted to the authorized Microsoft account. No demo data is displayed
            here.
          </p>
          <a class="primary" href="/auth/login">Sign in with Microsoft</a>
        </section>
      } @else {
        <section class="panel">
          <div class="heading">
            <div>
              <span class="eyebrow">READ-ONLY CONNECTION</span>
              <h2>Resources</h2>
            </div>
            <button type="button" (click)="load()" [disabled]="loading()">Refresh view</button>
          </div>
          @if (loading()) {
            <p>Checking Azure discovery…</p>
          } @else if (error()) {
            <p class="warning">{{ error() }}</p>
          } @else if (meta.status()?.discoveryStatus !== 'Succeeded') {
            <p class="warning">
              {{ discoveryMessage() }} An empty screen does not confirm an empty subscription.
            </p>
            @if (validLastDiscovery()) {
              <p>Last successful discovery: {{ validLastDiscovery() | date: 'medium' }}.</p>
            }
          } @else if (inventory()) {
            <p>
              {{ inventory()?.totalCount }} resources visible. Last successful discovery:
              {{ meta.status()?.lastDiscoveryAt | date: 'medium' }}.
            </p>
            @if (possiblyStale()) {
              <p class="warning">
                The last successful discovery is over 30 minutes old. This view may be stale.
              </p>
            }
            @if (inventory()?.totalCount === 0) {
              <div class="empty">
                <strong>No resources found</strong>
                <p>
                  Azure discovery found no resources visible to the configured identity and scope.
                </p>
              </div>
            } @else {
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Region</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (resource of inventory()?.items; track resource.id) {
                      <tr>
                        <td>{{ resource.name }}</td>
                        <td>{{ resource.resourceType }}</td>
                        <td>{{ resource.region }}</td>
                        <td>{{ resource.status }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="pagination" aria-label="Inventory pages">
                <button
                  type="button"
                  (click)="load(page() - 1)"
                  [disabled]="loading() || !inventory()?.hasPreviousPage"
                >
                  Previous
                </button>
                <span>Page {{ inventory()?.pageNumber }} of {{ inventory()?.totalPages }}</span>
                <button
                  type="button"
                  (click)="load(page() + 1)"
                  [disabled]="loading() || !inventory()?.hasNextPage"
                >
                  Next
                </button>
              </div>
            }
          }
          <p class="note">
            This is a cached view of Azure Resource Graph, which can lag changes and is limited by
            the identity's permissions. Refresh view reloads the cache; it does not start a
            discovery. Render's free service may sleep or restart.
          </p>
        </section>
        <section class="notice">
          <strong>Inventory only.</strong> Live billing, compliance and AI analysis are not enabled.
          Verify billing in the Azure portal.
        </section>
      }
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: #0d1117;
        color: #e6edf3;
      }
      .page {
        max-width: 1100px;
        margin: auto;
        padding: 40px 24px;
        font-family: Inter, system-ui, sans-serif;
      }
      header,
      .heading {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 20px;
      }
      header {
        margin-bottom: 28px;
      }
      h1 {
        font-size: 1.8rem;
        margin: 8px 0 0;
      }
      h2 {
        margin: 8px 0;
        font-size: 1.2rem;
      }
      .eyebrow {
        color: #79c0ff;
        font-size: 0.7rem;
        letter-spacing: 0.12em;
        font-weight: 700;
      }
      .panel,
      .notice {
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 14px;
        padding: 24px;
        margin-bottom: 16px;
      }
      p {
        color: #a8b4c2;
        line-height: 1.6;
      }
      .warning {
        color: #e3b341;
      }
      .note {
        font-size: 0.8rem;
        margin: 24px 0 0;
      }
      .empty {
        text-align: center;
        padding: 40px 12px;
        border: 1px dashed #30363d;
        border-radius: 10px;
      }
      button,
      .primary {
        display: inline-block;
        border: 1px solid #3c648f;
        border-radius: 8px;
        padding: 10px 15px;
        background: #1f6feb;
        color: white;
        font: inherit;
        text-decoration: none;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.55;
        cursor: default;
      }
      .table-wrap {
        overflow: auto;
      }
      .pagination {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 18px;
        color: #a8b4c2;
        font-size: 0.875rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }
      th,
      td {
        padding: 12px 10px;
        border-bottom: 1px solid #30363d;
      }
      th {
        color: #8b949e;
        font-size: 0.8rem;
      }
      .notice {
        color: #a8b4c2;
        font-size: 0.9rem;
      }
      .notice strong {
        color: #e6edf3;
      }
      @media (max-width: 600px) {
        .page {
          padding: 24px 16px;
        }
        header,
        .heading {
          align-items: flex-start;
          flex-wrap: wrap;
        }
      }
    `
  ]
})
export class LiveInventoryComponent implements OnInit {
  readonly meta = inject(MetaService);
  private readonly http = inject(HttpClient);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly inventory = signal<PagedResult<CloudResource> | null>(null);
  readonly page = signal(1);
  readonly possiblyStale = signal(false);

  validLastDiscovery(): string | null {
    const value = this.meta.status()?.lastDiscoveryAt;
    return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
  }

  discoveryMessage(): string {
    switch (this.meta.status()?.discoveryStatus) {
      case 'Failed':
        return 'The latest Azure discovery failed.';
      case 'PartialFailure':
        return 'The latest discovery was incomplete.';
      case 'InProgress':
        return 'Azure discovery is in progress.';
      default:
        return 'Discovery has not succeeded yet.';
    }
  }

  ngOnInit(): void {
    if (!this.meta.liveLoginRequired()) this.load();
  }

  load(page = this.page()): void {
    if (!Number.isInteger(page) || page < 1 || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.inventory.set(null);
    this.meta.getStatus().subscribe({
      next: (status) => {
        if (
          status.demoMode !== false ||
          status.liveInventoryOnly !== true ||
          !Array.isArray(status.configuredProviders) ||
          !status.configuredProviders.includes('Azure')
        ) {
          this.loading.set(false);
          this.error.set('A verified live Azure connection is unavailable.');
          return;
        }
        if (status.discoveryStatus !== 'Succeeded') {
          this.loading.set(false);
          return;
        }
        const lastDiscovery = Date.parse(status.lastDiscoveryAt ?? '');
        const serverTime = Date.parse(status.serverTimeUtc ?? '');
        if (
          !Number.isFinite(lastDiscovery) ||
          !Number.isFinite(serverTime) ||
          lastDiscovery > serverTime
        ) {
          this.loading.set(false);
          this.error.set('The discovery timestamp could not be verified.');
          return;
        }
        this.possiblyStale.set(serverTime - lastDiscovery > 30 * 60 * 1000);
        this.http
          .get<PagedResult<CloudResource>>(`/api/resources?pageNumber=${page}&pageSize=100`)
          .subscribe({
            next: (result) => {
              if (
                !Array.isArray(result?.items) ||
                !Number.isInteger(result.totalCount) ||
                result.totalCount < 0 ||
                result.pageNumber !== page ||
                !Number.isInteger(result.totalPages) ||
                result.totalPages < 0 ||
                typeof result.hasNextPage !== 'boolean' ||
                typeof result.hasPreviousPage !== 'boolean' ||
                result.items.some(
                  (resource) =>
                    !resource || resource.provider !== 'Azure' || typeof resource.id !== 'string'
                )
              ) {
                this.error.set('The inventory response could not be verified.');
              } else {
                this.page.set(page);
                this.inventory.set(result);
              }
              this.loading.set(false);
            },
            error: (error: unknown) => {
              if (error instanceof HttpErrorResponse && error.status === 401)
                this.meta.loadStatus();
              this.error.set('Could not load inventory. Try again.');
              this.loading.set(false);
            }
          });
      },
      error: () => {
        this.error.set('Could not verify discovery. Try again.');
        this.loading.set(false);
      }
    });
  }

  logout(): void {
    this.http.post('/auth/logout', {}).subscribe({
      next: () => this.meta.loadStatus(),
      error: () => this.error.set('Could not sign out. Try again.')
    });
  }
}
