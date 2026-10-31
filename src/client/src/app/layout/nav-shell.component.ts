import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter, interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MetaService } from '../core/services/meta.service';
import { NotificationService } from '../core/services/notification.service';
import { RefreshService } from '../core/services/refresh.service';
import { ResourceService } from '../core/services/resource.service';
import { ToastService } from '../core/services/toast.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  hint: string;
}

@Component({
  selector: 'app-nav-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule
  ],
  template: `
    <div class="shell" [class.nav-open]="navOpen()">
      <aside class="sidebar">
        <a class="brand" routerLink="/dashboard" (click)="closeOnMobile()">
          <div class="brand-mark">
            <mat-icon>radar</mat-icon>
          </div>
          <div class="brand-text">
            <h1>CloudScope</h1>
            <span>Infrastructure intelligence</span>
          </div>
        </a>

        <div class="nav-section-label">Workspace</div>
        <nav>
          @for (item of navItems; track item.route) {
            <a
              class="nav-link"
              [routerLink]="item.route"
              routerLinkActive="active"
              [matTooltip]="item.hint"
              matTooltipPosition="right"
              (click)="closeOnMobile()"
            >
              <mat-icon>{{ item.icon }}</mat-icon>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="sidebar-footer">
          <div class="runtime">
            <span
              class="runtime-dot"
              [class.live]="!!meta.status()?.configuredProviders?.length && !meta.demoMode()"
              [class.demo]="meta.demoMode()"
            ></span>
            <div class="runtime-text">
              <strong>{{
                !meta.status()
                  ? 'Status unavailable'
                  : meta.demoMode()
                    ? 'Demo estate'
                    : meta.status()?.configuredProviders?.length
                      ? 'Connected estate'
                      : 'No providers configured'
              }}</strong>
              <span>
                {{ meta.status()?.resourceCount ?? 0 }} resources ·
                {{ meta.status()?.relationshipCount ?? 0 }} edges
              </span>
            </div>
          </div>
          <div class="runtime-meta">
            <span>v{{ meta.status()?.version ?? '1.0.0' }}</span>
            <span>{{ meta.status()?.storageProvider ?? 'Unknown' }} storage</span>
          </div>
        </div>
      </aside>

      @if (navOpen()) {
        <button
          class="backdrop"
          type="button"
          aria-label="Close navigation"
          (click)="navOpen.set(false)"
        ></button>
      }

      <div class="main">
        <header class="topbar">
          <button
            class="icon-button nav-toggle"
            type="button"
            aria-label="Toggle navigation"
            (click)="navOpen.set(!navOpen())"
          >
            <mat-icon>menu</mat-icon>
          </button>

          <div class="crumb">
            <span class="crumb-root">CloudScope</span>
            <mat-icon>chevron_right</mat-icon>
            <span class="crumb-page">{{ pageTitle() }}</span>
          </div>

          <div class="topbar-actions">
            <span
              class="realtime"
              [class.on]="realtime.connected()"
              [matTooltip]="
                !meta.status()
                  ? 'Realtime unavailable: API status could not be loaded'
                  : meta.status()?.realtimeAvailable === false
                    ? 'Realtime is not supported by this backend'
                    : realtime.connected()
                      ? 'Realtime updates connected'
                      : 'Realtime updates offline'
              "
            >
              <span class="pulse"></span>
              {{ realtime.connected() ? 'Realtime live' : 'Realtime off' }}
            </span>

            @if (meta.demoMode()) {
              <span class="chip chip-purple">Demo data</span>
            } @else if (meta.status()?.configuredProviders?.length) {
              <span class="chip chip-good">Live</span>
            } @else if (meta.status()) {
              <span class="chip chip-warn">No providers</span>
            } @else {
              <span class="chip chip-warn">Status unavailable</span>
            }

            <button
              mat-stroked-button
              class="discover-button"
              type="button"
              [disabled]="discovering()"
              (click)="discover()"
            >
              <mat-icon>{{ discovering() ? 'hourglass_top' : 'sync' }}</mat-icon>
              {{ discovering() ? 'Discovering…' : 'Run discovery' }}
            </button>

            <a
              mat-icon-button
              href="https://github.com/Brandonflex/Azure"
              target="_blank"
              rel="noopener"
              matTooltip="View source on GitHub"
            >
              <mat-icon>code</mat-icon>
            </a>
          </div>
        </header>

        <main class="content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .shell {
        min-height: 100vh;
      }

      .sidebar {
        position: fixed;
        inset: 0 auto 0 0;
        width: 258px;
        background: linear-gradient(180deg, #0a1017 0%, #080c12 100%);
        border-right: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        z-index: 40;
        transition: transform 0.2s ease;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 22px 20px 18px;
        color: var(--text);
      }

      .brand-mark {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, rgba(88, 166, 255, 0.9), rgba(188, 140, 255, 0.8));
        color: #061019;
        box-shadow: 0 8px 20px rgba(88, 166, 255, 0.25);
      }

      .brand-mark mat-icon {
        font-size: 22px;
        width: 22px;
        height: 22px;
      }

      .brand-text h1 {
        margin: 0;
        font-size: 1.02rem;
        font-weight: 700;
        letter-spacing: -0.01em;
      }

      .brand-text span {
        display: block;
        font-size: 0.66rem;
        color: var(--text-dim);
        text-transform: uppercase;
        letter-spacing: 0.09em;
        margin-top: 2px;
      }

      .nav-section-label {
        padding: 8px 20px;
        font-size: 0.64rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--text-dim);
      }

      nav {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 0 10px;
      }

      .nav-link {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 9px 12px;
        border-radius: 9px;
        color: #9ba7b4;
        font-size: 0.86rem;
        font-weight: 500;
        transition:
          background 0.12s ease,
          color 0.12s ease;
        border-left: 2px solid transparent;
      }

      .nav-link mat-icon {
        font-size: 19px;
        width: 19px;
        height: 19px;
        opacity: 0.8;
      }

      .nav-link:hover {
        background: rgba(88, 166, 255, 0.07);
        color: #dce6f2;
      }

      .nav-link.active {
        background: linear-gradient(90deg, rgba(88, 166, 255, 0.14), rgba(88, 166, 255, 0.02));
        color: #dce9ff;
        border-left-color: var(--accent);
      }

      .nav-link.active mat-icon {
        color: var(--accent);
        opacity: 1;
      }

      .sidebar-footer {
        margin-top: auto;
        padding: 14px 16px 16px;
        border-top: 1px solid var(--border);
      }

      .runtime {
        display: flex;
        gap: 10px;
        align-items: flex-start;
      }

      .runtime-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-top: 5px;
        flex-shrink: 0;
      }

      .runtime-dot.live {
        background: var(--green);
        box-shadow: 0 0 0 3px rgba(63, 185, 80, 0.15);
      }
      .runtime-dot.demo {
        background: var(--purple);
        box-shadow: 0 0 0 3px rgba(188, 140, 255, 0.15);
      }

      .runtime-text strong {
        display: block;
        font-size: 0.76rem;
        color: #c9d1d9;
        font-weight: 600;
      }
      .runtime-text span {
        display: block;
        font-size: 0.68rem;
        color: var(--text-dim);
        margin-top: 2px;
      }

      .runtime-meta {
        display: flex;
        justify-content: space-between;
        margin-top: 12px;
        font-size: 0.64rem;
        color: var(--text-dim);
      }

      .main {
        margin-left: 258px;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }

      .topbar {
        position: sticky;
        top: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 28px;
        background: rgba(13, 17, 23, 0.85);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid var(--border);
        min-height: 64px;
      }

      .crumb {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.82rem;
        color: var(--text-dim);
      }
      .crumb mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .crumb-page {
        color: #c9d1d9;
        font-weight: 600;
      }

      .topbar-actions {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .realtime {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.72rem;
        color: var(--text-dim);
        padding: 4px 9px;
        border-radius: 999px;
        border: 1px solid var(--border);
      }

      .realtime .pulse {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--text-dim);
      }

      .realtime.on {
        color: var(--green);
        border-color: rgba(63, 185, 80, 0.3);
      }
      .realtime.on .pulse {
        background: var(--green);
        box-shadow: 0 0 0 0 rgba(63, 185, 80, 0.5);
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(63, 185, 80, 0.45);
        }
        70% {
          box-shadow: 0 0 0 6px rgba(63, 185, 80, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(63, 185, 80, 0);
        }
      }

      .discover-button mat-icon {
        font-size: 17px;
        width: 17px;
        height: 17px;
        margin-right: 4px;
      }

      .content {
        padding: 26px 28px 40px;
        flex: 1;
      }

      .icon-button {
        background: transparent;
        border: 1px solid var(--border);
        color: var(--text-muted);
        border-radius: 9px;
        width: 36px;
        height: 36px;
        display: none;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .icon-button:hover {
        color: var(--text);
        border-color: var(--border-strong);
      }

      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(1, 4, 9, 0.6);
        border: none;
        z-index: 39;
        display: none;
      }

      @media (max-width: 1080px) {
        .sidebar {
          transform: translateX(-100%);
        }
        .nav-open .sidebar {
          transform: translateX(0);
        }
        .main {
          margin-left: 0;
        }
        .icon-button.nav-toggle {
          display: flex;
        }
        .backdrop {
          display: block;
        }
        .topbar {
          padding: 10px 16px;
        }
        .content {
          padding: 20px 16px 32px;
        }
      }

      @media (max-width: 720px) {
        .crumb {
          display: none;
        }
        .realtime {
          display: none;
        }
        .discover-button {
          padding: 0 10px;
        }
        .discover-button ::ng-deep .mdc-button__label {
          display: none;
        }
      }
    `
  ]
})
export class NavShellComponent implements OnInit, OnDestroy {
  readonly meta = inject(MetaService);
  readonly realtime = inject(NotificationService);

  private readonly resourceService = inject(ResourceService);
  private readonly refresh = inject(RefreshService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'space_dashboard', route: '/dashboard', hint: 'Estate overview' },
    {
      label: 'Infrastructure graph',
      icon: 'hub',
      route: '/graph',
      hint: 'Interactive dependency map'
    },
    { label: 'Resources', icon: 'inventory_2', route: '/resources', hint: 'Searchable inventory' },
    {
      label: 'Cost intelligence',
      icon: 'payments',
      route: '/costs',
      hint: 'Spend, forecast, anomalies'
    },
    {
      label: 'Compliance',
      icon: 'verified_user',
      route: '/compliance',
      hint: 'Policy posture and findings'
    },
    {
      label: 'AI query',
      icon: 'auto_awesome',
      route: '/query',
      hint: 'Ask questions in plain English'
    }
  ];

  readonly pageTitle = signal('Dashboard');
  readonly discovering = signal(false);
  readonly navOpen = signal(false);

  private readonly titles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/graph': 'Infrastructure graph',
    '/resources': 'Resources',
    '/costs': 'Cost intelligence',
    '/compliance': 'Compliance',
    '/query': 'AI query'
  };

  constructor() {
    // A static deployment is not a SignalR server. Wait for valid metadata,
    // and only connect when the backend actually exposes the hub. Older .NET
    // servers omit the capability field and are assumed to support SignalR.
    effect(() => {
      const status = this.meta.status();
      if (status && status.realtimeAvailable !== false) this.realtime.startConnection();
      else this.realtime.stopConnection();
    });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe((event) => {
        const path = event.urlAfterRedirects.split('?')[0];
        this.pageTitle.set(this.titles[path] ?? 'Dashboard');
        this.navOpen.set(false);
        window.scrollTo({ top: 0 });
      });
  }

  ngOnInit(): void {
    this.meta.loadStatus();
    interval(30000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.meta.loadStatus());
    this.realtime.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event.type === 'discoveryCompleted' && !this.discovering()) {
        this.refresh.bump();
        this.meta.loadStatus();
      }
    });
  }

  ngOnDestroy(): void {
    this.realtime.stopConnection();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth > 1080) this.navOpen.set(false);
  }

  closeOnMobile(): void {
    if (window.innerWidth <= 1080) this.navOpen.set(false);
  }

  discover(): void {
    if (this.discovering()) return;
    this.discovering.set(true);

    this.resourceService.triggerDiscovery().subscribe({
      next: (result) => {
        this.discovering.set(false);
        const failures = result.providers.filter((provider) => provider.error);
        if (failures.length) {
          this.toast.error(
            `Discovery incomplete: ${failures.map((provider) => provider.provider).join(', ')} failed. Check server logs.`
          );
        } else {
          this.toast.success(
            `${result.resourcesDiscovered} resources and ${result.relationshipsDiscovered} relationships synced in ${result.durationSeconds}s.`
          );
        }
        this.meta.loadStatus();
        this.refresh.bump();
      },
      error: () => {
        this.discovering.set(false);
        this.toast.error(
          'Discovery failed. Check that the API is running and credentials are configured.'
        );
      }
    });
  }
}
