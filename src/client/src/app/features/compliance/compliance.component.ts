import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ChartData, ChartOptions } from 'chart.js';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChartComponent } from '../../shared/components/chart/chart.component';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ComplianceService } from '../../core/services/compliance.service';
import { ToastService } from '../../core/services/toast.service';
import { RefreshService } from '../../core/services/refresh.service';
import {
  COMPLIANCE_FRAMEWORKS,
  ComplianceFramework,
  CompliancePolicy,
  CompliancePosture,
  ComplianceReport
} from '../../core/models';
import { dateTime, percent } from '../../core/utils/format';

@Component({
  selector: 'app-compliance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatTabsModule,
    MatExpansionModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    ChartComponent,
    StatCardComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent
  ],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Compliance &amp; posture</h1>
          <p class="subtitle">
            Continuous policy evaluation across CIS, SOC 2, HIPAA and GDPR
            @if (posture()?.lastScanAt) {
              · last scan {{ timeAgoLabel() }}
            }
          </p>
        </div>
        <div class="actions">
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="scanning()"
            (click)="runScan()"
          >
            @if (scanning()) {
              <mat-spinner diameter="16" class="button-spinner" />
            } @else {
              <mat-icon>security</mat-icon>
            }
            {{ scanning() ? 'Scanning…' : 'Run compliance scan' }}
          </button>
        </div>
      </div>

      @if (scanning()) {
        <div class="scan-progress panel">
          <div class="scan-copy">
            <mat-icon>radar</mat-icon>
            <div>
              <strong>Evaluating {{ selectedFrameworkLabel() }} policies</strong>
              <span>Comparing every resource property against the rule catalog…</span>
            </div>
          </div>
          <mat-progress-bar mode="indeterminate" />
        </div>
      }

      @if (loading()) {
        <app-loading-spinner message="Evaluating compliance posture…" />
      } @else if (error()) {
        <app-empty-state
          icon="cloud_off"
          title="Compliance data unavailable"
          message="The API could not evaluate policies. Check the backend connection and try again."
          actionLabel="Retry"
          (action)="load()"
        />
      } @else {
        <div class="grid grid-4 stats">
          <app-stat-card
            label="Overall score"
            [value]="averageScore() + '%'"
            icon="verified_user"
            accentColor="#3fb950"
            [subtitle]="posture()?.totalViolations + ' open findings'"
            [badge]="scoreBadge()"
            [badgeNegative]="averageScore() < 80"
          />

          <app-stat-card
            label="Critical findings"
            [value]="(posture()?.criticalViolations ?? 0).toString()"
            icon="dangerous"
            accentColor="#f85149"
            [subtitle]="(posture()?.highViolations ?? 0) + ' high severity'"
            [badge]="(posture()?.criticalViolations ?? 0) > 0 ? 'Action needed' : 'Clear'"
            [badgeNegative]="(posture()?.criticalViolations ?? 0) > 0"
          />

          <app-stat-card
            label="Policies evaluated"
            [value]="totalResults().toString()"
            icon="rule"
            accentColor="#58a6ff"
            [subtitle]="policies().length + ' rules in catalog'"
          />

          <app-stat-card
            label="Frameworks"
            [value]="frameworkCount().toString()"
            icon="policy"
            accentColor="#bc8cff"
            [subtitle]="'CIS · SOC 2 · HIPAA · GDPR'"
          />
        </div>

        <div class="grid grid-2-1 section">
          <div class="panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Framework scores</h2>
                <p class="panel-sub">Weighted pass rate across enabled policies</p>
              </div>
            </div>
            <div class="panel-body">
              <div class="framework-grid">
                @for (framework of frameworks(); track framework.key) {
                  <button
                    type="button"
                    class="framework-card"
                    [class.active]="selectedFramework() === framework.key"
                    [style.--framework-color]="framework.color"
                    (click)="selectFramework(framework.key)"
                  >
                    <div class="framework-donut">
                      <svg viewBox="0 0 36 36">
                        <circle class="track" cx="18" cy="18" r="15.9" />
                        <circle
                          class="value"
                          cx="18"
                          cy="18"
                          r="15.9"
                          [style.stroke-dasharray]="framework.score + ', 100'"
                        />
                      </svg>
                      <span>{{ framework.score }}%</span>
                    </div>
                    <div class="framework-copy">
                      <strong>{{ framework.label }}</strong>
                      <span>{{ framework.passed }} passed · {{ framework.failed }} failed</span>
                    </div>
                  </button>
                }
              </div>

              <div class="chart-frame small score-chart">
                <app-chart [type]="'bar'" [data]="scoreChart()" [options]="scoreChartOptions" />
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Findings by severity</h2>
                <p class="panel-sub">Open violations</p>
              </div>
            </div>
            <div class="panel-body">
              <div class="chart-frame small">
                <app-chart
                  [type]="'doughnut'"
                  [data]="severityChart()"
                  [options]="severityOptions"
                  cutout="62%"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="panel">
            <div class="panel-head report-head">
              <div>
                <h2 class="panel-title">{{ selectedFrameworkLabel() }} report</h2>
                <p class="panel-sub">
                  {{ report()?.compliantCount ?? 0 }} compliant ·
                  {{ report()?.nonCompliantCount ?? 0 }} non-compliant ·
                  {{ report()?.notApplicableCount ?? 0 }} N/A
                  @if (report()?.generatedAt) {
                    · generated {{ dateTime(report()!.generatedAt) }}
                  }
                </p>
              </div>
              <div class="report-actions">
                <mat-button-toggle-group
                  [value]="selectedFramework()"
                  (change)="selectFramework($event.value)"
                  hideSingleSelectionIndicator
                >
                  @for (framework of frameworkKeys; track framework) {
                    <mat-button-toggle [value]="framework">{{
                      frameworkLabel(framework)
                    }}</mat-button-toggle>
                  }
                </mat-button-toggle-group>
              </div>
            </div>

            <div class="report-summary">
              <div class="summary-metric">
                <span>Compliance</span>
                <strong [class]="scoreClass(report()?.compliancePercentage ?? 0)">
                  {{ percent(report()?.compliancePercentage ?? 0, 1) }}
                </strong>
              </div>
              <div class="summary-metric">
                <span>Policies</span>
                <strong>{{ report()?.totalPolicies ?? 0 }}</strong>
              </div>
              <div class="summary-metric">
                <span>Violations</span>
                <strong>{{ report()?.topViolations?.length ?? 0 }}</strong>
              </div>
              <div class="summary-metric">
                <span>Results</span>
                <strong>{{ report()?.results?.length ?? 0 }}</strong>
              </div>
            </div>

            <mat-tab-group animationDuration="150ms" class="report-tabs">
              <mat-tab label="Top violations">
                <div class="tab-body tight">
                  <div class="list">
                    @for (violation of report()?.topViolations ?? []; track $index) {
                      <div class="list-item">
                        <div class="item-icon" [class]="severityClass(violation.severity)">
                          <mat-icon>gpp_maybe</mat-icon>
                        </div>
                        <div class="item-main">
                          <div class="item-title">
                            {{ violation.policyName }}
                            <span class="chip" [class]="severityClass(violation.severity)">
                              {{ violation.severity }}
                            </span>
                          </div>
                          <div class="item-meta">
                            {{ violation.resourceName }} — {{ violation.details }}
                          </div>
                          <div class="item-meta dim">
                            <strong>Remediation:</strong> {{ violation.remediation }}
                          </div>
                        </div>
                      </div>
                    }
                    @if ((report()?.topViolations?.length ?? 0) === 0) {
                      <div class="all-clear">
                        <mat-icon>task_alt</mat-icon>
                        <span>No violations for this framework.</span>
                      </div>
                    }
                  </div>
                </div>
              </mat-tab>

              <mat-tab [label]="'All results (' + (report()?.results?.length ?? 0) + ')'">
                <div class="tab-body tight">
                  <div class="table-toolbar">
                    <mat-form-field appearance="outline" class="filter-input">
                      <mat-label>Filter results</mat-label>
                      <mat-icon matPrefix>search</mat-icon>
                      <input
                        matInput
                        type="text"
                        [ngModel]="resultFilter()"
                        (ngModelChange)="resultFilter.set($event)"
                      />
                    </mat-form-field>
                    <mat-form-field appearance="outline" class="filter-select">
                      <mat-label>Status</mat-label>
                      <mat-select
                        [ngModel]="statusFilter()"
                        (ngModelChange)="statusFilter.set($event)"
                      >
                        <mat-option value="all">All</mat-option>
                        <mat-option value="NonCompliant">Non-compliant</mat-option>
                        <mat-option value="Compliant">Compliant</mat-option>
                        <mat-option value="NotApplicable">Not applicable</mat-option>
                      </mat-select>
                    </mat-form-field>
                  </div>

                  <div class="table-scroll results-scroll">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>Policy</th>
                          <th>Resource</th>
                          <th>Status</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (result of filteredResults(); track result.id) {
                          <tr>
                            <td>
                              <div class="cell-strong">{{ result.policyName }}</div>
                              <div class="cell-sub mono">{{ result.policyId }}</div>
                            </td>
                            <td>
                              <div>{{ result.resourceName }}</div>
                              <div class="cell-sub mono">{{ shortId(result.resourceId) }}</div>
                            </td>
                            <td>
                              <span class="chip" [class]="statusChip(result.status)">{{
                                result.status
                              }}</span>
                            </td>
                            <td class="cell-muted result-details">{{ result.details || '—' }}</td>
                          </tr>
                        }
                        @if (filteredResults().length === 0) {
                          <tr>
                            <td colspan="4" class="muted">No results match the filter.</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              </mat-tab>

              <mat-tab [label]="'Policy catalog (' + policies().length + ')'">
                <div class="tab-body tight">
                  <mat-accordion multi class="policy-accordion">
                    @for (policy of filteredPolicies(); track policy.id) {
                      <mat-expansion-panel>
                        <mat-expansion-panel-header>
                          <mat-panel-title>
                            <span class="policy-name">{{ policy.name }}</span>
                            <span class="chip" [class]="severityClass(policy.severity)">{{
                              policy.severity
                            }}</span>
                          </mat-panel-title>
                          <mat-panel-description>
                            {{ policy.framework }} · {{ policy.category }}
                          </mat-panel-description>
                        </mat-expansion-panel-header>

                        <p class="policy-description">{{ policy.description }}</p>
                        <dl class="policy-meta">
                          <div>
                            <dt>Rule</dt>
                            <dd class="mono">{{ policy.ruleExpression }}</dd>
                          </div>
                          <div>
                            <dt>Applies to</dt>
                            <dd>
                              @if (policy.applicableResourceTypes.length === 0) {
                                All resource types
                              } @else {
                                {{ policy.applicableResourceTypes.join(', ') }}
                              }
                            </dd>
                          </div>
                          <div>
                            <dt>Remediation</dt>
                            <dd>{{ policy.remediation }}</dd>
                          </div>
                        </dl>
                      </mat-expansion-panel>
                    }
                  </mat-accordion>
                </div>
              </mat-tab>
            </mat-tab-group>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .stats {
        margin-bottom: 18px;
      }
      .section {
        margin-bottom: 18px;
      }

      .scan-progress {
        margin-bottom: 16px;
        padding: 14px 18px;
      }
      .scan-copy {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-bottom: 12px;
      }
      .scan-copy mat-icon {
        color: var(--accent);
      }
      .scan-copy strong {
        display: block;
        font-size: 0.88rem;
      }
      .scan-copy span {
        font-size: 0.76rem;
        color: var(--text-muted);
      }

      .button-spinner {
        display: inline-block;
        margin-right: 6px;
      }

      .framework-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 6px;
      }

      .framework-card {
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(240, 246, 252, 0.03);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        cursor: pointer;
        text-align: left;
        color: inherit;
        transition:
          border-color 0.15s ease,
          background 0.15s ease;
      }
      .framework-card:hover {
        border-color: rgba(88, 166, 255, 0.35);
      }
      .framework-card.active {
        border-color: var(--framework-color);
        background: rgba(88, 166, 255, 0.06);
      }

      .framework-donut {
        position: relative;
        width: 54px;
        height: 54px;
        flex-shrink: 0;
      }
      .framework-donut svg {
        transform: rotate(-90deg);
        width: 54px;
        height: 54px;
      }
      .framework-donut circle {
        fill: none;
        stroke-width: 3;
      }
      .framework-donut .track {
        stroke: rgba(240, 246, 252, 0.08);
      }
      .framework-donut .value {
        stroke: var(--framework-color, #58a6ff);
        stroke-linecap: round;
        stroke-dasharray: 0, 100;
        transition: stroke-dasharray 0.5s ease;
      }
      .framework-donut span {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.72rem;
        font-weight: 700;
      }

      .framework-copy strong {
        display: block;
        font-size: 0.85rem;
      }
      .framework-copy span {
        display: block;
        font-size: 0.7rem;
        color: var(--text-dim);
        margin-top: 2px;
      }

      .score-chart {
        margin-top: 16px;
      }

      .report-head {
        padding-bottom: 0;
        flex-wrap: wrap;
      }
      .report-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .report-summary {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        padding: 16px 20px;
      }
      .summary-metric {
        background: rgba(240, 246, 252, 0.03);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 12px;
      }
      .summary-metric span {
        display: block;
        font-size: 0.67rem;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--text-dim);
      }
      .summary-metric strong {
        display: block;
        margin-top: 4px;
        font-size: 1.1rem;
        font-weight: 650;
      }
      .summary-metric strong.good {
        color: var(--green);
      }
      .summary-metric strong.warn {
        color: var(--yellow);
      }
      .summary-metric strong.bad {
        color: var(--red);
      }

      .tab-body {
        padding: 8px 0 0;
      }
      .tab-body.tight {
        padding: 8px 0 0;
      }

      .report-tabs {
        margin-top: 4px;
      }

      .item-icon {
        color: var(--yellow);
        background: rgba(210, 153, 34, 0.12);
      }
      .item-icon.severity-critical {
        color: var(--red);
        background: rgba(248, 81, 73, 0.12);
      }
      .item-icon.severity-high {
        color: #ffa657;
        background: rgba(255, 166, 87, 0.12);
      }
      .item-icon.severity-medium {
        color: var(--yellow);
        background: rgba(210, 153, 34, 0.12);
      }
      .item-icon.severity-low {
        color: var(--text-muted);
        background: rgba(139, 148, 158, 0.12);
      }

      .item-title .chip {
        margin-left: 6px;
      }

      .table-toolbar {
        display: flex;
        gap: 12px;
        padding: 14px 20px 0;
      }
      .filter-input {
        max-width: 320px;
      }
      .filter-select {
        max-width: 190px;
      }

      .results-scroll {
        max-height: 460px;
        overflow-y: auto;
      }
      .result-details {
        max-width: 380px;
      }

      .policy-accordion {
        margin: 8px 20px 20px;
      }
      .policy-accordion mat-expansion-panel {
        background: rgba(240, 246, 252, 0.02) !important;
        border: 1px solid var(--border);
        border-radius: 10px !important;
        margin-bottom: 8px;
        box-shadow: none !important;
      }
      .policy-name {
        font-weight: 600;
        font-size: 0.86rem;
        margin-right: 8px;
      }
      .policy-description {
        font-size: 0.82rem;
        color: var(--text-muted);
        margin: 4px 0 14px;
      }
      .policy-meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        margin: 0 0 8px;
      }
      .policy-meta dt {
        font-size: 0.66rem;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--text-dim);
      }
      .policy-meta dd {
        margin: 3px 0 0;
        font-size: 0.79rem;
        color: var(--text-muted);
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

      @media (max-width: 900px) {
        .framework-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .report-summary {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .policy-meta {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `
  ]
})
export class ComplianceComponent implements OnInit {
  private readonly complianceService = inject(ComplianceService);
  private readonly refresh = inject(RefreshService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly frameworkKeys = COMPLIANCE_FRAMEWORKS;

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly scanning = signal(false);
  readonly posture = signal<CompliancePosture | null>(null);
  readonly report = signal<ComplianceReport | null>(null);
  readonly policies = signal<CompliancePolicy[]>([]);
  readonly selectedFramework = signal<ComplianceFramework>('CIS');
  readonly resultFilter = signal('');
  readonly statusFilter = signal('all');

  readonly averageScore = computed(() => {
    const scores = Object.values(this.posture()?.frameworkScores ?? {});
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  });

  readonly scoreBadge = computed(() =>
    this.averageScore() >= 80 ? 'Healthy' : this.averageScore() >= 60 ? 'Watch' : 'At risk'
  );
  readonly frameworkCount = computed(
    () => Object.keys(this.posture()?.frameworkScores ?? {}).length
  );
  readonly totalResults = computed(() => this.report()?.results?.length ?? 0);
  readonly selectedFrameworkLabel = computed(() => this.frameworkLabel(this.selectedFramework()));

  readonly frameworks = computed(() => {
    const scores = this.posture()?.frameworkScores ?? {};
    const results = this.report()?.results ?? [];

    return this.frameworkKeys.map((key) => {
      const score = Math.round(scores[key] ?? 0);
      const frameworkResults = results.filter((result) => result.framework === key);
      const passed = frameworkResults.filter((result) => result.status === 'Compliant').length;
      const failed = frameworkResults.filter((result) => result.status === 'NonCompliant').length;

      return {
        key,
        label: this.frameworkLabel(key),
        score,
        passed,
        failed,
        color: score >= 80 ? '#3fb950' : score >= 60 ? '#d29922' : '#f85149'
      };
    });
  });

  readonly scoreChart = computed<ChartData>(() => ({
    labels: this.frameworks().map((framework) => framework.label),
    datasets: [
      {
        label: 'Compliance score',
        data: this.frameworks().map((framework) => framework.score),
        backgroundColor: this.frameworks().map((framework) => `${framework.color}99`),
        borderColor: this.frameworks().map((framework) => framework.color),
        borderWidth: 1,
        borderRadius: 6,
        maxBarThickness: 34
      }
    ]
  }));

  readonly scoreChartOptions: ChartOptions = {
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, max: 100, ticks: { callback: (value) => `${value}%` } }
    }
  };

  readonly severityChart = computed<ChartData>(() => {
    const violations = this.report()?.topViolations ?? [];
    const counts = new Map<string, number>();

    for (const violation of violations) {
      const severity = (violation.severity || 'Unknown').toLowerCase();
      counts.set(severity, (counts.get(severity) ?? 0) + 1);
    }

    if (counts.size === 0) {
      counts.set('no findings', 1);
    }

    const colorFor = (severity: string): string => {
      if (severity === 'critical') return '#f85149';
      if (severity === 'high') return '#ffa657';
      if (severity === 'medium') return '#d29922';
      if (severity === 'no findings') return '#3fb950';
      return '#8b949e';
    };

    return {
      labels: [...counts.keys()].map((key) => key.replace(/^./, (c) => c.toUpperCase())),
      datasets: [
        {
          data: [...counts.values()],
          backgroundColor: [...counts.keys()].map(colorFor),
          borderColor: 'rgba(13, 17, 23, 0.9)',
          borderWidth: 2
        }
      ]
    };
  });

  readonly severityOptions: ChartOptions = {
    plugins: {
      legend: { position: 'bottom' as const, labels: { boxWidth: 8, font: { size: 10 } } }
    }
  };

  readonly filteredResults = computed(() => {
    const filter = this.resultFilter().trim().toLowerCase();
    const status = this.statusFilter();
    const results = this.report()?.results ?? [];

    return results.filter((result) => {
      const matchesStatus = status === 'all' || result.status === status;
      const matchesText =
        !filter ||
        result.policyName.toLowerCase().includes(filter) ||
        result.resourceName.toLowerCase().includes(filter) ||
        (result.details ?? '').toLowerCase().includes(filter);
      return matchesStatus && matchesText;
    });
  });

  readonly filteredPolicies = computed(() => this.policies());

  ngOnInit(): void {
    this.load();

    this.refresh.refreshed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);

    forkJoin({
      posture: this.complianceService.getPosture(),
      policies: this.complianceService.getPolicies(),
      report: this.complianceService.getReport(this.selectedFramework())
    }).subscribe({
      next: (result) => {
        this.posture.set(result.posture);
        this.policies.set(result.policies);
        this.report.set(result.report);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(true);
        this.toast.error('Failed to load compliance data.');
      }
    });
  }

  selectFramework(framework: ComplianceFramework): void {
    if (this.selectedFramework() === framework) return;
    this.selectedFramework.set(framework);
    this.report.set(null);

    this.complianceService.getReport(framework).subscribe({
      next: (report) => this.report.set(report),
      error: () => this.toast.error(`Could not load the ${this.frameworkLabel(framework)} report.`)
    });
  }

  runScan(): void {
    if (this.scanning()) return;
    this.scanning.set(true);

    this.complianceService.runScan(this.selectedFramework()).subscribe({
      next: (result) => {
        this.scanning.set(false);
        this.toast.success(
          `${result.compliant} compliant and ${result.nonCompliant} non-compliant of ${result.totalEvaluated} evaluations.`
        );
        this.load();
      },
      error: () => {
        this.scanning.set(false);
        this.toast.error('Compliance scan failed.');
      }
    });
  }

  frameworkLabel(framework: ComplianceFramework | string): string {
    if (framework === 'SOC2') return 'SOC 2';
    if (framework === 'PCI_DSS') return 'PCI DSS';
    return String(framework);
  }

  scoreClass(score: number): string {
    if (score >= 80) return 'good';
    if (score >= 60) return 'warn';
    return 'bad';
  }

  severityClass(severity: string | null | undefined): string {
    const value = (severity ?? 'medium').toLowerCase();
    if (value === 'critical') return 'severity-critical';
    if (value === 'high') return 'severity-high';
    if (value === 'medium') return 'severity-medium';
    return 'severity-low';
  }

  statusChip(status: string): string {
    if (status === 'Compliant') return 'chip-good';
    if (status === 'NonCompliant') return 'chip-bad';
    return 'chip-neutral';
  }

  shortId(id: string): string {
    return id.length > 30 ? `…${id.slice(-28)}` : id;
  }

  timeAgoLabel(): string {
    const lastScan = this.posture()?.lastScanAt;
    if (!lastScan) return 'never';

    const seconds = Math.max(0, Math.round((Date.now() - new Date(lastScan).getTime()) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    return `${Math.round(seconds / 3600)}h ago`;
  }

  protected readonly percent = percent;
  protected readonly dateTime = dateTime;
}
