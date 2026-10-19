import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { FormsModule } from '@angular/forms';
import { ChartData, ChartOptions } from 'chart.js';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChartComponent } from '../../shared/components/chart/chart.component';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { CostService } from '../../core/services/cost.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import {
  CostAnomaly,
  CostByCategory,
  CostForecast,
  CostRecommendation,
  CostSummary,
  CostTrend,
  ResourceCost
} from '../../core/models';
import { compactCurrency, currency, shortDate } from '../../core/utils/format';

type PeriodKey = '30d' | '60d' | '90d';

@Component({
  selector: 'app-costs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatTabsModule,
    ChartComponent,
    StatCardComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent
  ],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Cost intelligence</h1>
          <p class="subtitle">
            Spend attribution, forecasting and savings opportunities
            @if (summary(); as costSummary) {
              · {{ costSummary.periodStart.substring(0, 10) }} → {{ costSummary.periodEnd.substring(0, 10) }}
            }
          </p>
        </div>
        <div class="actions">
          <mat-button-toggle-group
            [value]="period()"
            (change)="onPeriodChange($event.value)"
            hideSingleSelectionIndicator>
            @for (option of periods; track option.key) {
              <mat-button-toggle [value]="option.key">{{ option.label }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
          <button mat-stroked-button type="button" [disabled]="loading()" (click)="load()">
            <mat-icon>refresh</mat-icon> Refresh
          </button>
        </div>
      </div>

      @if (loading()) {
        <app-loading-spinner message="Aggregating cost data…" />
      } @else if (error()) {
        <app-empty-state
          icon="cloud_off"
          title="Cost data unavailable"
          message="The API did not return cost telemetry. Start the backend and retry."
          actionLabel="Retry"
          (action)="load()" />
      } @else {
        <div class="grid grid-4 stats">
          <app-stat-card
            label="Total spend"
            [value]="currency(summary()?.totalCost ?? 0)"
            icon="payments"
            accentColor="#3fb950"
            [subtitle]="'Selected period · ' + currency(summary()?.totalCost ?? 0) + ' trail'"
            [badge]="monthOverMonthLabel()"
            [badgeNegative]="(summary()?.monthOverMonthChange ?? 0) > 0" />

          <app-stat-card
            label="Forecast (30d)"
            [value]="currency(forecastTotal())"
            icon="insights"
            accentColor="#58a6ff"
            [subtitle]="'Confidence ' + forecastConfidence() + '%'"
            [badge]="forecastDeltaLabel()"
            [badgeNegative]="forecastDelta() > 0" />

          <app-stat-card
            label="Potential savings"
            [value]="currency(totalSavings())"
            icon="savings"
            accentColor="#bc8cff"
            [subtitle]="recommendations().length + ' recommendations'"
            [badge]="savingsPercent() + '%'" />

          <app-stat-card
            label="Anomalies"
            [value]="anomalies().length.toString()"
            icon="warning"
            accentColor="#ef6b5d"
            [subtitle]="anomalyHeadline()"
            [badge]="anomalies().length > 0 ? 'Review' : 'Clear'"
            [badgeNegative]="anomalies().length > 0" />
        </div>

        <div class="grid grid-2-1 section">
          <div class="panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Spend trend</h2>
                <p class="panel-sub">Daily cost by provider</p>
              </div>
              <div class="trend-legend">
                <span><i class="dot azure"></i>Azure {{ currency(summary()?.azureCost ?? 0) }}</span>
                <span><i class="dot aws"></i>AWS {{ currency(summary()?.awsCost ?? 0) }}</span>
              </div>
            </div>
            <div class="panel-body">
              <div class="chart-frame tall">
                <app-chart [type]="'line'" [data]="trendChart()" [options]="currencyChartOptions()" />
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Spend by type</h2>
                <p class="panel-sub">Top categories</p>
              </div>
            </div>
            <div class="panel-body">
              <div class="chart-frame tall">
                <app-chart [type]="'doughnut'" [data]="categoryChart()" [options]="doughnutOptions" cutout="66%" />
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-2 section">
          <div class="panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Forecast</h2>
                <p class="panel-sub">{{ forecast().length }}-day projection with confidence band</p>
              </div>
            </div>
            <div class="panel-body">
              <div class="chart-frame">
                <app-chart [type]="'line'" [data]="forecastChart()" [options]="currencyChartOptions()" />
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Cost by region</h2>
                <p class="panel-sub">Where the money is spent</p>
              </div>
            </div>
            <div class="panel-body">
              <div class="chart-frame">
                <app-chart [type]="'bar'" [data]="regionChart()" [options]="barOptions()" />
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-2-1 section">
          <div class="panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Savings opportunities</h2>
                <p class="panel-sub">Prioritised by monthly impact</p>
              </div>
            </div>
            <div class="panel-body tight">
              <div class="list">
                @for (recommendation of recommendations(); track recommendation.id) {
                  <div class="list-item">
                    <div class="item-icon savings"><mat-icon>lightbulb</mat-icon></div>
                    <div class="item-main">
                      <div class="item-title">
                        {{ recommendation.title }}
                        <span class="chip chip-neutral rec-category">{{ recommendation.category }}</span>
                      </div>
                      <div class="item-meta">{{ recommendation.description }}</div>
                      <div class="item-meta dim">{{ recommendation.resourceName }} · {{ recommendation.region }}</div>
                    </div>
                    <div class="rec-impact">
                      <strong>{{ currency(recommendation.estimatedMonthlySavings) }}</strong>
                      <span>/mo</span>
                      <em>{{ recommendation.confidence }} confidence</em>
                    </div>
                  </div>
                }
                @if (recommendations().length === 0) {
                  <div class="all-clear">
                    <mat-icon>task_alt</mat-icon>
                    <span>No optimisation recommendations right now.</span>
                  </div>
                }
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Anomalies</h2>
                <p class="panel-sub">Statistical outliers</p>
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
                    <div class="anomaly-impact">
                      <strong>+{{ anomaly.deviationPercentage.toFixed(0) }}%</strong>
                      <span>{{ currency(anomaly.actualCost) }}</span>
                    </div>
                  </div>
                }
                @if (anomalies().length === 0) {
                  <div class="all-clear">
                    <mat-icon>task_alt</mat-icon>
                    <span>No anomalies detected in this period.</span>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <mat-tab-group animationDuration="160ms" class="detail-tabs">
            <mat-tab label="Top resources">
              <div class="panel tab-panel">
                <div class="table-scroll">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Resource</th>
                        <th>Provider</th>
                        <th>Resource group</th>
                        <th class="cell-right">Monthly</th>
                        <th class="cell-right">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of topResources(); track item.resourceId; let index = $index) {
                        <tr>
                          <td class="cell-muted">{{ index + 1 }}</td>
                          <td class="cell-strong">{{ item.resourceName }}</td>
                          <td>
                            <span class="chip" [class]="item.provider === 'Azure' ? 'chip-azure' : 'chip-aws'">
                              {{ item.provider }}
                            </span>
                          </td>
                          <td class="cell-muted">{{ item.resourceGroup }}</td>
                          <td class="cell-right cell-mono">{{ currency(item.amount) }}</td>
                          <td class="cell-right">
                            <div class="share">
                              <div class="share-bar"><span [style.width.%]="shareOf(item)"></span></div>
                              <span class="cell-muted">{{ shareOf(item).toFixed(1) }}%</span>
                            </div>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </mat-tab>

            <mat-tab label="By resource group">
              <div class="panel tab-panel">
                <div class="table-scroll">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Resource group</th>
                        <th class="cell-right">Monthly</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (group of summary()?.byResourceGroup ?? []; track group.category) {
                        <tr>
                          <td class="cell-strong">{{ group.category }}</td>
                          <td class="cell-right cell-mono">{{ currency(group.amount) }}</td>
                          <td>
                            <div class="share">
                              <div class="share-bar"><span [style.width.%]="group.percentage"></span></div>
                              <span class="cell-muted">{{ group.percentage.toFixed(1) }}%</span>
                            </div>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </mat-tab>
          </mat-tab-group>
        </div>
      }
    </div>
  `,
  styles: [`
    .stats { margin-bottom: 18px; }
    .section { margin-bottom: 18px; }

    .trend-legend { display: flex; gap: 14px; font-size: 0.75rem; color: var(--text-muted); }
    .trend-legend span { display: inline-flex; align-items: center; gap: 6px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .dot.azure { background: #58a6ff; }
    .dot.aws { background: #ffa657; }

    .item-icon.savings { color: var(--purple); background: rgba(188, 140, 255, 0.12); }
    .item-icon.anomaly { color: var(--yellow); background: rgba(210, 153, 34, 0.12); }

    .rec-category { margin-left: 6px; text-transform: capitalize; }

    .rec-impact { text-align: right; flex-shrink: 0; }
    .rec-impact strong { font-size: 0.95rem; color: var(--green); }
    .rec-impact span { font-size: 0.7rem; color: var(--text-dim); }
    .rec-impact em { display: block; font-style: normal; font-size: 0.66rem; color: var(--text-dim); margin-top: 2px; }

    .anomaly-impact { text-align: right; flex-shrink: 0; }
    .anomaly-impact strong { display: block; color: var(--yellow); font-size: 0.9rem; }
    .anomaly-impact span { font-size: 0.7rem; color: var(--text-dim); }

    .share { display: flex; align-items: center; gap: 8px; min-width: 120px; }
    .share-bar { flex: 1; height: 5px; border-radius: 999px; background: rgba(240, 246, 252, 0.07); overflow: hidden; }
    .share-bar span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #58a6ff, #bc8cff); }

    .all-clear { display: flex; align-items: center; gap: 8px; padding: 24px 20px; color: var(--text-muted); font-size: 0.85rem; }
    .all-clear mat-icon { color: var(--green); }

    .tab-panel { border-radius: 0 0 14px 14px; }
  `]
})
export class CostsComponent implements OnInit {
  private readonly costService = inject(CostService);
  private readonly refresh = inject(RefreshService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly periods: { key: PeriodKey; label: string; days: number }[] = [
    { key: '30d', label: '30 days', days: 30 },
    { key: '60d', label: '60 days', days: 60 },
    { key: '90d', label: '90 days', days: 90 }
  ];

  readonly period = signal<PeriodKey>('30d');
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly summary = signal<CostSummary | null>(null);
  readonly trends = signal<CostTrend[]>([]);
  readonly forecast = signal<CostForecast[]>([]);
  readonly anomalies = signal<CostAnomaly[]>([]);
  readonly topResources = signal<ResourceCost[]>([]);
  readonly recommendations = signal<CostRecommendation[]>([]);

  readonly forecastTotal = computed(() =>
    this.forecast().length === 0
      ? 0
      : this.forecast().reduce((sum, point) => sum + point.predictedCost, 0)
  );

  readonly forecastConfidence = computed(() => {
    const confidence = this.forecast()[0]?.confidenceLevel ?? 0;
    return Math.round(confidence <= 1 ? confidence * 100 : confidence);
  });

  readonly forecastDelta = computed(() => {
    const baseline = this.summary()?.totalCost ?? 0;
    if (baseline === 0) return 0;
    return ((this.forecastTotal() - baseline) / baseline) * 100;
  });

  readonly forecastDeltaLabel = computed(() => `${this.forecastDelta() >= 0 ? '+' : ''}${this.forecastDelta().toFixed(1)}% vs actual`);

  readonly totalSavings = computed(() =>
    this.recommendations().reduce((sum, item) => sum + item.estimatedMonthlySavings, 0)
  );

  readonly savingsPercent = computed(() => {
    const total = this.summary()?.totalCost ?? 0;
    if (total === 0) return 0;
    return Math.round((this.totalSavings() / total) * 100);
  });

  readonly anomalyHeadline = computed(() => {
    const anomaly = this.anomalies().at(0);
    return anomaly ? anomaly.resourceName : 'No deviation detected';
  });

  readonly monthOverMonthLabel = computed(() => {
    const change = this.summary()?.monthOverMonthChange ?? 0;
    return `${change >= 0 ? '+' : ''}${change.toFixed(1)}% MoM`;
  });

  readonly trendChart = computed<ChartData>(() => ({
    labels: this.trends().map((point) => shortDate(point.date)),
    datasets: [
      {
        label: 'Azure',
        data: this.trends().map((point) => point.azureCost),
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
        data: this.trends().map((point) => point.awsCost),
        borderColor: '#ffa657',
        backgroundColor: 'rgba(255, 166, 87, 0.12)',
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 0,
        pointHitRadius: 12
      },
      {
        label: 'Forecast',
        data: this.trends().map((point, index) => {
          const forecastPoint = this.forecast()[index];
          return forecastPoint ? forecastPoint.predictedCost : null;
        }),
        borderColor: 'rgba(188, 140, 255, 0.9)',
        borderDash: [5, 4],
        borderWidth: 1.6,
        pointRadius: 0,
        fill: false,
        tension: 0.3
      }
    ]
  }));

  readonly forecastChart = computed<ChartData>(() => ({
    labels: this.forecast().map((point) => shortDate(point.forecastDate)),
    datasets: [
      {
        label: 'Upper bound',
        data: this.forecast().map((point) => point.upperBound),
        borderColor: 'rgba(188, 140, 255, 0.25)',
        backgroundColor: 'rgba(188, 140, 255, 0.08)',
        pointRadius: 0,
        borderWidth: 1,
        fill: '+1'
      },
      {
        label: 'Predicted',
        data: this.forecast().map((point) => point.predictedCost),
        borderColor: '#bc8cff',
        backgroundColor: 'rgba(188, 140, 255, 0.12)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: false
      },
      {
        label: 'Lower bound',
        data: this.forecast().map((point) => point.lowerBound),
        borderColor: 'rgba(188, 140, 255, 0.25)',
        backgroundColor: 'rgba(188, 140, 255, 0.0)',
        pointRadius: 0,
        borderWidth: 1,
        fill: false
      }
    ]
  }));

  readonly categoryChart = computed<ChartData>(() => {
    const categories = this.summary()?.byResourceType ?? [];
    return {
      labels: categories.slice(0, 8).map((item) => this.humanizeCategory(item)),
      datasets: [
        {
          data: categories.slice(0, 8).map((item) => item.amount),
          backgroundColor: [
            '#58a6ff', '#bc8cff', '#3fb950', '#ffa657', '#79c0ff', '#d29922', '#f0883e', '#6e7681'
          ],
          borderColor: 'rgba(13, 17, 23, 0.9)',
          borderWidth: 2,
          hoverOffset: 6
        }
      ]
    };
  });

  readonly regionChart = computed<ChartData>(() => {
    const regions = [...(this.summary()?.byRegion ?? [])].sort((a, b) => b.amount - a.amount).slice(0, 8);
    return {
      labels: regions.map((item) => item.category),
      datasets: [
        {
          label: 'Monthly cost',
          data: regions.map((item) => item.amount),
          backgroundColor: 'rgba(88, 166, 255, 0.55)',
          borderColor: '#58a6ff',
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 26
        }
      ]
    };
  });

  readonly doughnutOptions: ChartOptions = {
    plugins: { legend: { position: 'bottom' as const, labels: { boxWidth: 8, font: { size: 10 } } } }
  };

  ngOnInit(): void {
    this.load();

    this.refresh.refreshed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  onPeriodChange(period: PeriodKey): void {
    this.period.set(period);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);

    const days = this.periods.find((item) => item.key === this.period())?.days ?? 30;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));

    forkJoin({
      summary: this.costService.getSummary(start, end),
      trends: this.costService.getTrends(start, end),
      forecast: this.costService.getForecast(30),
      anomalies: this.costService.getAnomalies(),
      topResources: this.costService.getTopResources(12),
      recommendations: this.costService.getRecommendations()
    }).subscribe({
      next: (result) => {
        this.summary.set(result.summary);
        this.trends.set(result.trends);
        this.forecast.set(result.forecast);
        this.anomalies.set(result.anomalies);
        this.topResources.set(result.topResources);
        this.recommendations.set(result.recommendations);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(true);
        this.toast.error('Failed to load cost intelligence.');
      }
    });
  }

  shareOf(item: ResourceCost): number {
    const total = this.summary()?.totalCost ?? 0;
    return total === 0 ? 0 : (item.amount / total) * 100;
  }

  humanizeCategory(item: CostByCategory): string {
    return item.category.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  currencyChartOptions(): ChartOptions {
    return {
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label ?? ''}: ${currency(Number(context.parsed.y))}`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => compactCurrency(Number(value)) }
        }
      }
    };
  }

  barOptions(): ChartOptions {
    return {
      indexAxis: 'y' as const,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => currency(Number(context.parsed.x))
          }
        }
      },
      scales: {
        x: { ticks: { callback: (value) => compactCurrency(Number(value)) } },
        y: { grid: { display: false } }
      }
    };
  }

  protected readonly currency = currency;
}
