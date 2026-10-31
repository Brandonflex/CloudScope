import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChartData, ChartOptions } from 'chart.js';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { ChartComponent } from '../../shared/components/chart/chart.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ResourceService } from '../../core/services/resource.service';
import { CostService } from '../../core/services/cost.service';
import { ComplianceService } from '../../core/services/compliance.service';
import { MetaService } from '../../core/services/meta.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import {
  CloudResource,
  CompliancePosture,
  CostAnomaly,
  CostSummary,
  CostTrend,
  ResourceCost
} from '../../core/models';
import { PROVIDER_COLORS, STATUS_COLORS } from '../../core/models';
import {
  compactCurrency,
  currency,
  dateTime,
  percent,
  resourceIcon,
  shortDate,
  timeAgo,
  typeLabel
} from '../../core/utils/format';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    MatTooltipModule,
    StatCardComponent,
    ChartComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent
  ],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Estate overview</h1>
          <p class="subtitle">
            Multi-cloud inventory, spend and posture
            @if (meta.status()?.lastDiscoveryAt) {
              · synced {{ timeAgo(meta.status()?.lastDiscoveryAt) }}
            }
          </p>
        </div>
        <div class="actions">
          <a mat-stroked-button routerLink="/graph"> <mat-icon>hub</mat-icon> Open graph </a>
          <a mat-flat-button color="primary" routerLink="/query">
            <mat-icon>auto_awesome</mat-icon> Ask CloudScope
          </a>
        </div>
      </div>

      @if (meta.demoMode()) {
        <div class="demo-banner">
          <mat-icon>science</mat-icon>
          <div>
            <strong>You are exploring a demo estate</strong>
            <p>
              54 synthetic resources across Azure and AWS are loaded so every feature is usable. A
              separately protected backend and read-only access are required to discover a real
              estate. Never add cloud credentials to this demo preview.
            </p>
          </div>
          <a mat-stroked-button routerLink="/resources">Browse resources</a>
        </div>
      }

      @if (
        !meta.demoMode() &&
        meta.status()?.configuredProviders?.length &&
        meta.status()?.discoveryStatus !== 'Succeeded'
      ) {
        <div class="demo-banner" role="status">
          <mat-icon>cloud_off</mat-icon>
          <div>
            <strong>Live inventory is not confirmed</strong>
            <p>
              Discovery is pending or has failed. Counts may be empty or stale; they do not confirm
              that the cloud subscription contains no resources.
            </p>
          </div>
        </div>
      }

      @if (loading()) {
        <app-loading-spinner message="Loading estate overview…" />
      } @else if (loadError()) {
        <app-empty-state
          icon="cloud_off"
          title="Could not load the overview"
          message="The CloudScope API could not be reached. Check the backend connection or open a protected demo preview."
          actionLabel="Retry"
          (action)="load()"
        />
      } @else {
        <div class="grid grid-4 stats">
          <app-stat-card
            label="Resources"
            [value]="resourceCount().toString()"
            icon="inventory_2"
            accentColor="#58a6ff"
            [subtitle]="azureCount() + ' Azure · ' + awsCount() + ' AWS'"
            [badge]="relationshipCount() + ' edges'"
          />

          <app-stat-card
            label="Monthly spend"
            [value]="currency(costs()?.totalCost ?? 0)"
            icon="payments"
            accentColor="#3fb950"
            [subtitle]="
              'Azure ' +
              currency(costs()?.azureCost ?? 0) +
              ' · AWS ' +
              currency(costs()?.awsCost ?? 0)
            "
            [badge]="monthOverMonth() + '% MoM'"
            [badgeNegative]="(costs()?.monthOverMonthChange ?? 0) > 0"
          />

          <app-stat-card
            label="Compliance findings"
            [value]="(posture()?.totalViolations ?? 0).toString()"
            icon="verified_user"
            accentColor="#f0883e"
            [subtitle]="
              (posture()?.criticalViolations ?? 0) +
              ' critical · ' +
              (posture()?.highViolations ?? 0) +
              ' high'
            "
            [badge]="averageScore() + '% avg'"
          />

          <app-stat-card
            label="Outside IaC"
            [value]="unmanagedCount().toString()"
            icon="build_circle"
            accentColor="#bc8cff"
            [subtitle]="'of ' + resources().length + ' resources with drift'"
            [badge]="driftPercent() + '%'"
          />
        </div>

        <div class="grid grid-2-1 section">
          <div class="panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Daily spend</h2>
                <p class="panel-sub">Last 30 days across both clouds</p>
              </div>
              <a mat-button color="primary" routerLink="/costs">Details</a>
            </div>
            <div class="panel-body">
              <div class="chart-frame">
                <app-chart [type]="'line'" [data]="costChart()" [options]="costChartOptions" />
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Resource mix</h2>
                <p class="panel-sub">By resource type</p>
              </div>
            </div>
            <div class="panel-body">
              <div class="chart-frame">
                <app-chart
                  [type]="'doughnut'"
                  [data]="typeChart()"
                  [options]="doughnutOptions"
                  cutout="68%"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-2-1 section">
          <div class="panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Compliance posture</h2>
                <p class="panel-sub">Policy pass rate by framework</p>
              </div>
              <a mat-button color="primary" routerLink="/compliance">Open report</a>
            </div>
            <div class="panel-body">
              <div class="framework-list">
                @for (framework of frameworks(); track framework.name) {
                  <div class="framework-row">
                    <div class="framework-head">
                      <span class="framework-name">{{ framework.name }}</span>
                      <span class="framework-score" [class]="scoreClass(framework.score)">
                        {{ framework.score }}%
                      </span>
                    </div>
                    <mat-progress-bar
                      mode="determinate"
                      [value]="framework.score"
                      [color]="framework.color"
                    />
                    <span class="framework-meta">{{ framework.label }}</span>
                  </div>
                }
                @if (frameworks().length === 0) {
                  <p class="muted">No compliance frameworks evaluated yet.</p>
                }
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Needs attention</h2>
                <p class="panel-sub">Critical and warning resources</p>
              </div>
            </div>
            <div class="panel-body tight">
              <div class="list">
                @for (resource of attention(); track resource.id) {
                  <div class="list-item">
                    <div class="item-icon" [style.color]="statusColor(resource.status)">
                      <mat-icon>{{ iconFor(resource.resourceType) }}</mat-icon>
                    </div>
                    <div class="item-main">
                      <div class="item-title">{{ resource.name }}</div>
                      <div class="item-meta">
                        {{ typeLabel(resource.resourceType) }} · {{ resource.region }}
                        <span class="attention-status" [style.color]="statusColor(resource.status)">
                          {{ resource.status }}
                        </span>
                      </div>
                    </div>
                    <span class="cell-mono muted">{{
                      currency(resource.estimatedMonthlyCost)
                    }}</span>
                  </div>
                }
                @if (attention().length === 0) {
                  <div class="all-clear">
                    <mat-icon>task_alt</mat-icon>
                    <span>Every resource is healthy.</span>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-2 section">
          <div class="panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Most expensive resources</h2>
                <p class="panel-sub">Trailing 30 days</p>
              </div>
              <a mat-button color="primary" routerLink="/costs">Cost explorer</a>
            </div>
            <div class="table-scroll">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>Provider</th>
                    <th class="cell-right">Monthly</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of topResources(); track item.resourceId) {
                    <tr>
                      <td>
                        <div class="cell-strong">{{ item.resourceName }}</div>
                        <div class="cell-sub">{{ item.resourceGroup }}</div>
                      </td>
                      <td>
                        <span
                          class="chip"
                          [class]="item.provider === 'Azure' ? 'chip-azure' : 'chip-aws'"
                          >{{ item.provider }}</span
                        >
                      </td>
                      <td class="cell-right cell-mono">{{ currency(item.amount) }}</td>
                    </tr>
                  }
                  @if (topResources().length === 0) {
                    <tr>
                      <td colspan="3" class="muted">No cost data yet.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Cost anomalies</h2>
                <p class="panel-sub">Z-score detection over 30 days</p>
              </div>
            </div>
            <div class="panel-body tight">
              <div class="list">
                @for (anomaly of anomalies(); track anomaly.id) {
                  <div class="list-item">
                    <div class="item-icon anomaly"><mat-icon>trending_up</mat-icon></div>
                    <div class="item-main">
                      <div class="item-title">{{ anomaly.resourceName }}</div>
                      <div class="item-meta">{{ anomaly.description }}</div>
                    </div>
                    <span class="chip chip-warn"
                      >+{{ anomaly.deviationPercentage.toFixed(0) }}%</span
                    >
                  </div>
                }
                @if (anomalies().length === 0) {
                  <div class="all-clear">
                    <mat-icon>task_alt</mat-icon>
                    <span>No cost anomalies detected.</span>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .demo-banner {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 18px;
        margin-bottom: 18px;
        border-radius: 14px;
        border: 1px solid rgba(188, 140, 255, 0.25);
        background: linear-gradient(120deg, rgba(188, 140, 255, 0.12), rgba(88, 166, 255, 0.06));
      }
      .demo-banner mat-icon {
        color: var(--purple);
      }
      .demo-banner strong {
        font-size: 0.9rem;
      }
      .demo-banner p {
        margin: 3px 0 0;
        font-size: 0.8rem;
        color: var(--text-muted);
        max-width: 780px;
      }
      .demo-banner code {
        font-size: 0.75rem;
        background: rgba(240, 246, 252, 0.08);
        padding: 1px 4px;
        border-radius: 4px;
      }
      .demo-banner a {
        margin-left: auto;
        flex-shrink: 0;
      }

      .stats {
        margin-bottom: 18px;
      }
      .section {
        margin-bottom: 18px;
      }

      .framework-list {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .framework-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 8px;
      }
      .framework-name {
        font-size: 0.86rem;
        font-weight: 600;
      }
      .framework-score {
        font-size: 0.85rem;
        font-weight: 700;
      }
      .framework-score.good {
        color: var(--green);
      }
      .framework-score.warn {
        color: var(--yellow);
      }
      .framework-score.bad {
        color: var(--red);
      }
      .framework-meta {
        display: block;
        margin-top: 6px;
        font-size: 0.73rem;
        color: var(--text-dim);
      }

      .attention-status {
        margin-left: 6px;
        font-weight: 600;
      }
      .item-icon.anomaly {
        color: var(--yellow);
        background: rgba(210, 153, 34, 0.12);
      }

      .all-clear {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 24px 20px;
        color: var(--text-muted);
        font-size: 0.85rem;
      }
      .all-clear mat-icon {
        color: var(--green);
      }

      @media (max-width: 760px) {
        .demo-banner {
          flex-wrap: wrap;
        }
        .demo-banner a {
          margin-left: 0;
        }
      }
    `
  ]
})
export class DashboardComponent implements OnInit {
  readonly meta = inject(MetaService);
  private readonly resourceService = inject(ResourceService);
  private readonly costService = inject(CostService);
  private readonly complianceService = inject(ComplianceService);
  private readonly refresh = inject(RefreshService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly resources = signal<CloudResource[]>([]);
  readonly costs = signal<CostSummary | null>(null);
  readonly trends = signal<CostTrend[]>([]);
  readonly posture = signal<CompliancePosture | null>(null);
  readonly topResources = signal<ResourceCost[]>([]);
  readonly anomalies = signal<CostAnomaly[]>([]);

  readonly resourceCount = computed(
    () => this.meta.status()?.resourceCount ?? this.resources().length
  );
  readonly relationshipCount = computed(() => this.meta.status()?.relationshipCount ?? 0);
  readonly azureCount = computed(
    () => this.resources().filter((r) => r.provider === 'Azure').length
  );
  readonly awsCount = computed(() => this.resources().filter((r) => r.provider === 'AWS').length);
  readonly unmanagedCount = computed(
    () => this.resources().filter((r) => !r.isManagedByIaC).length
  );
  readonly driftPercent = computed(() => {
    const total = this.resources().length;
    return total === 0 ? 0 : Math.round((this.unmanagedCount() / total) * 100);
  });
  readonly monthOverMonth = computed(() => (this.costs()?.monthOverMonthChange ?? 0).toFixed(1));
  readonly averageScore = computed(() => {
    const scores = Object.values(this.posture()?.frameworkScores ?? {});
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
  });

  readonly attention = computed(() =>
    this.resources()
      .filter((r) => r.status === 'Critical' || r.status === 'Warning')
      .sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost)
      .slice(0, 5)
  );

  readonly frameworks = computed(() => {
    const scores = this.posture()?.frameworkScores ?? {};
    return ['CIS', 'SOC2', 'HIPAA', 'GDPR']
      .filter((name) => name in scores)
      .map((name) => {
        const score = Math.round(scores[name] ?? 0);
        return {
          name: name === 'SOC2' ? 'SOC 2' : name,
          score,
          color: score >= 80 ? 'primary' : score >= 60 ? 'accent' : 'warn',
          label: score >= 80 ? 'Healthy' : score >= 60 ? 'Needs attention' : 'At risk'
        };
      });
  });

  readonly costChart = computed<ChartData>(() => {
    const trends = this.trends();
    return {
      labels: trends.map((t) => shortDate(t.date)),
      datasets: [
        {
          label: 'Azure',
          data: trends.map((t) => t.azureCost),
          borderColor: '#58a6ff',
          backgroundColor: 'rgba(88, 166, 255, 0.16)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 12
        },
        {
          label: 'AWS',
          data: trends.map((t) => t.awsCost),
          borderColor: '#ffa657',
          backgroundColor: 'rgba(255, 166, 87, 0.12)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 12
        }
      ]
    };
  });

  readonly typeChart = computed<ChartData>(() => {
    const counts = new Map<string, number>();
    for (const resource of this.resources()) {
      counts.set(resource.resourceType, (counts.get(resource.resourceType) ?? 0) + 1);
    }

    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 7);
    const rest = entries.slice(7).reduce((sum, [, count]) => sum + count, 0);

    if (rest > 0) top.push(['Other', rest]);

    return {
      labels: top.map(([label]) => typeLabel(label)),
      datasets: [
        {
          data: top.map(([, count]) => count),
          backgroundColor: [
            '#58a6ff',
            '#bc8cff',
            '#3fb950',
            '#ffa657',
            '#f0883e',
            '#79c0ff',
            '#d29922',
            '#6e7681'
          ],
          borderColor: 'rgba(13, 17, 23, 0.9)',
          borderWidth: 2,
          hoverOffset: 6
        }
      ]
    };
  });

  readonly costChartOptions: ChartOptions = {
    plugins: {
      legend: { display: true },
      tooltip: {
        callbacks: {
          label: (context) =>
            `${context.dataset.label ?? ''}: ${currency(Number(context.parsed.y))}`
        }
      }
    },
    scales: {
      x: { stacked: false },
      y: {
        stacked: false,
        ticks: {
          callback: (value) => compactCurrency(Number(value))
        }
      }
    }
  };

  readonly doughnutOptions: ChartOptions = {
    plugins: {
      legend: { position: 'right' as const }
    }
  };

  ngOnInit(): void {
    this.load();

    this.refresh.refreshed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(false);

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);

    forkJoin({
      resources: this.resourceService.getAll({ pageSize: 500 }),
      costs: this.costService.getSummary(start, end),
      trends: this.costService.getTrends(start, end),
      posture: this.complianceService.getPosture(),
      top: this.costService.getTopResources(6),
      anomalies: this.costService.getAnomalies()
    }).subscribe({
      next: (result) => {
        this.resources.set(result.resources.items);
        this.costs.set(result.costs);
        this.trends.set(result.trends);
        this.posture.set(result.posture);
        this.topResources.set(result.top);
        this.anomalies.set(result.anomalies);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
        this.toast.error('Could not load the dashboard.');
      }
    });
  }

  iconFor(type: string): string {
    return resourceIcon(type);
  }

  statusColor(status: string): string {
    return STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? PROVIDER_COLORS.Azure;
  }

  scoreClass(score: number): string {
    if (score >= 80) return 'good';
    if (score >= 60) return 'warn';
    return 'bad';
  }

  protected readonly currency = currency;
  protected readonly compactCurrency = compactCurrency;
  protected readonly dateTime = dateTime;
  protected readonly percent = percent;
  protected readonly timeAgo = timeAgo;
  protected readonly typeLabel = typeLabel;
}
