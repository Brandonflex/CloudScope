import { Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { ResourceService } from '../../core/services/resource.service';
import { CostService } from '../../core/services/cost.service';
import { ComplianceService } from '../../core/services/compliance.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule, StatCardComponent],
  template: `
    <div class="dashboard">
      <div class="page-header">
        <h1>Dashboard</h1>
        <p class="page-subtitle">Multi-cloud infrastructure overview</p>
      </div>

      <div class="stats-grid">
        <app-stat-card
          label="Total Resources"
          [value]="totalResources().toString()"
          icon="inventory_2"
          accentColor="#4fc3f7"
          subtitle="Across Azure + AWS" />
        <app-stat-card
          label="Azure Resources"
          [value]="azureResources().toString()"
          icon="cloud"
          accentColor="#0078d4"
          subtitle="Microsoft Azure" />
        <app-stat-card
          label="AWS Resources"
          [value]="awsResources().toString()"
          icon="cloud_queue"
          accentColor="#ff9900"
          subtitle="Amazon Web Services" />
        <app-stat-card
          label="Monthly Cost"
          [value]="'$' + totalCost().toFixed(2)"
          icon="payments"
          accentColor="#66bb6a"
          [subtitle]="costChange() + ' vs last month'" />
      </div>

      <div class="content-grid">
        <mat-card class="content-card">
          <mat-card-header>
            <mat-card-title>Resource Distribution</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="placeholder-chart">
              <mat-icon>donut_large</mat-icon>
              <p>Resource type distribution chart</p>
              <p class="hint">Chart.js integration — showing resource types across clouds</p>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="content-card">
          <mat-card-header>
            <mat-card-title>Cost Trend (30 Days)</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="placeholder-chart">
              <mat-icon>show_chart</mat-icon>
              <p>Cost trend line chart</p>
              <p class="hint">Azure + AWS daily cost over time with forecast</p>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="content-card">
          <mat-card-header>
            <mat-card-title>Compliance Posture</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="placeholder-chart">
              <mat-icon>verified_user</mat-icon>
              <p>Compliance status by framework</p>
              <p class="hint">CIS, SOC 2, HIPAA compliance percentages</p>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="content-card">
          <mat-card-header>
            <mat-card-title>Recent Activity</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="activity-list">
              <div class="activity-item">
                <mat-icon class="activity-icon" color="primary">add_circle</mat-icon>
                <span>System ready — connect your cloud accounts to start discovery</span>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .dashboard { max-width: 1400px; }
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin: 0; font-size: 1.8rem; }
    .page-subtitle { margin: 4px 0 0; opacity: 0.5; font-size: 0.9rem; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .content-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 16px;
    }
    .content-card {
      background: #161b22;
      border-radius: 8px;
      min-height: 250px;
    }
    .placeholder-chart {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      opacity: 0.4;
    }
    .placeholder-chart mat-icon { font-size: 48px; width: 48px; height: 48px; margin-bottom: 12px; }
    .hint { font-size: 0.75rem; opacity: 0.5; }
    .activity-list { padding: 8px 0; }
    .activity-item { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
    .activity-icon { font-size: 20px; width: 20px; height: 20px; }
  `]
})
export class DashboardComponent implements OnInit {
  totalResources = signal(0);
  azureResources = signal(0);
  awsResources = signal(0);
  totalCost = signal(0);
  costChange = signal('0%');

  ngOnInit(): void {
    // Dashboard stats will be populated when cloud accounts are connected
  }
}