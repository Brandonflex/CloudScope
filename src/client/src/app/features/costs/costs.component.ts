import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { CostService } from '../../core/services/cost.service';
import { CostSummary, CostTrend } from '../../core/models';

@Component({
  selector: 'app-costs',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatTableModule, MatButtonToggleModule, StatCardComponent],
  template: `
    <div class="costs-page">
      <div class="page-header">
        <h1>Cost Intelligence</h1>
        <p class="page-subtitle">Multi-cloud cost analysis, forecasting, and anomaly detection</p>
      </div>

      <div class="stats-grid">
        <app-stat-card
          label="Total Spend (30d)"
          [value]="'$' + totalCost().toFixed(2)"
          icon="account_balance"
          accentColor="#66bb6a" />
        <app-stat-card
          label="Azure Spend"
          [value]="'$' + azureCost().toFixed(2)"
          icon="cloud"
          accentColor="#0078d4" />
        <app-stat-card
          label="AWS Spend"
          [value]="'$' + awsCost().toFixed(2)"
          icon="cloud_queue"
          accentColor="#ff9900" />
        <app-stat-card
          label="Month-over-Month"
          [value]="moMChange().toFixed(1) + '%'"
          icon="trending_up"
          [accentColor]="moMChange() > 0 ? '#ef5350' : '#66bb6a'" />
      </div>

      <div class="content-grid">
        <mat-card class="content-card full-width">
          <mat-card-header>
            <mat-card-title>Cost Trend</mat-card-title>
            <div class="card-actions">
              <mat-button-toggle-group value="30d">
                <mat-button-toggle value="7d">7D</mat-button-toggle>
                <mat-button-toggle value="30d">30D</mat-button-toggle>
                <mat-button-toggle value="90d">90D</mat-button-toggle>
              </mat-button-toggle-group>
            </div>
          </mat-card-header>
          <mat-card-content>
            <div class="placeholder-chart">
              <mat-icon>show_chart</mat-icon>
              <p>Stacked area chart — Azure (blue) + AWS (orange) daily costs</p>
              <p class="hint">Chart.js line chart with gradient fills and forecast projection</p>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="content-card">
          <mat-card-header>
            <mat-card-title>Cost by Resource Type</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="placeholder-chart">
              <mat-icon>donut_large</mat-icon>
              <p>Doughnut chart — cost distribution by resource type</p>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="content-card">
          <mat-card-header>
            <mat-card-title>Cost Anomalies</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="anomaly-list">
              @if (anomalies().length === 0) {
                <div class="empty-state">
                  <mat-icon>check_circle</mat-icon>
                  <p>No anomalies detected</p>
                </div>
              }
              @for (anomaly of anomalies(); track anomaly.id) {
                <div class="anomaly-item">
                  <mat-icon color="warn">warning</mat-icon>
                  <div>
                    <strong>{{ anomaly.resourceName }}</strong>
                    <p>{{ anomaly.description }}</p>
                  </div>
                </div>
              }
            </div>
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .costs-page { max-width: 1400px; }
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin: 0; font-size: 1.8rem; }
    .page-subtitle { margin: 4px 0 0; opacity: 0.5; font-size: 0.9rem; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .content-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 16px;
    }
    .content-card { background: #161b22; border-radius: 8px; }
    .full-width { grid-column: 1 / -1; }
    .card-actions { margin-left: auto; }
    .placeholder-chart {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 40px; opacity: 0.4;
    }
    .placeholder-chart mat-icon { font-size: 48px; width: 48px; height: 48px; margin-bottom: 12px; }
    .hint { font-size: 0.75rem; opacity: 0.5; }
    .empty-state { text-align: center; padding: 32px; opacity: 0.4; }
    .anomaly-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .anomaly-item p { margin: 4px 0 0; font-size: 0.8rem; opacity: 0.6; }
  `]
})
export class CostsComponent implements OnInit {
  private readonly costService = inject(CostService);

  totalCost = signal(0);
  azureCost = signal(0);
  awsCost = signal(0);
  moMChange = signal(0);
  anomalies = signal<any[]>([]);

  ngOnInit(): void {
    // Costs will be populated when cloud accounts are connected
  }
}