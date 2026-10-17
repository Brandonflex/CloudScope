import { Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { ComplianceService } from '../../core/services/compliance.service';
import { ComplianceFramework, CompliancePosture } from '../../core/models';

@Component({
  selector: 'app-compliance',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatChipsModule, MatTabsModule],
  template: `
    <div class="compliance-page">
      <div class="page-header">
        <div>
          <h1>Compliance & Security</h1>
          <p class="page-subtitle">Policy-as-code compliance scanning across CIS, SOC 2, HIPAA, GDPR</p>
        </div>
        <button mat-raised-button color="primary" (click)="runScan()">
          <mat-icon>security</mat-icon> Run Scan
        </button>
      </div>

      <div class="framework-grid">
        @for (framework of frameworks; track framework.name) {
          <mat-card class="framework-card">
            <mat-card-header>
              <mat-card-title>{{ framework.name }}</mat-card-title>
              <mat-card-subtitle>{{ framework.description }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div class="score-container">
                <div class="score-circle" [class]="'score-' + framework.scoreClass">
                  <span class="score-value">{{ framework.score }}%</span>
                </div>
                <mat-progress-bar
                  mode="determinate"
                  [value]="framework.score"
                  [color]="framework.score > 80 ? 'primary' : framework.score > 50 ? 'accent' : 'warn'" />
              </div>
              <div class="violation-summary">
                <span class="violations">
                  <mat-icon>error_outline</mat-icon>
                  {{ framework.violations }} violations
                </span>
                <span class="critical">
                  <mat-icon>warning</mat-icon>
                  {{ framework.critical }} critical
                </span>
              </div>
            </mat-card-content>
            <mat-card-actions>
              <button mat-button color="primary">View Report</button>
              <button mat-button>Export PDF</button>
            </mat-card-actions>
          </mat-card>
        }
      </div>

      <mat-card class="violations-card">
        <mat-card-header>
          <mat-card-title>Top Violations</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="placeholder-violations">
            <mat-icon>gpp_maybe</mat-icon>
            <p>Run a compliance scan to see violations</p>
            <p class="hint">Results will show policy violations with remediation guidance</p>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .compliance-page { max-width: 1400px; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
    }
    .page-header h1 { margin: 0; font-size: 1.8rem; }
    .page-subtitle { margin: 4px 0 0; opacity: 0.5; font-size: 0.9rem; }
    .framework-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .framework-card { background: #161b22; border-radius: 8px; }
    .score-container { padding: 16px 0; text-align: center; }
    .score-circle {
      width: 80px; height: 80px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 12px;
      font-size: 1.4rem;
      font-weight: 700;
    }
    .score-good { background: rgba(102,187,106,0.2); color: #66bb6a; border: 2px solid #66bb6a; }
    .score-warning { background: rgba(255,167,38,0.2); color: #ffa726; border: 2px solid #ffa726; }
    .score-critical { background: rgba(239,83,80,0.2); color: #ef5350; border: 2px solid #ef5350; }
    .score-unknown { background: rgba(117,117,117,0.2); color: #757575; border: 2px solid #757575; }
    .violation-summary {
      display: flex; justify-content: space-around;
      padding-top: 12px; font-size: 0.85rem;
    }
    .violations, .critical { display: flex; align-items: center; gap: 4px; }
    .violations mat-icon, .critical mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .critical { color: #ef5350; }
    .violations-card { background: #161b22; border-radius: 8px; }
    .placeholder-violations {
      display: flex; flex-direction: column;
      align-items: center; padding: 48px; opacity: 0.4;
    }
    .placeholder-violations mat-icon { font-size: 48px; width: 48px; height: 48px; margin-bottom: 12px; }
    .hint { font-size: 0.75rem; opacity: 0.5; }
  `]
})
export class ComplianceComponent implements OnInit {
  private readonly complianceService = inject(ComplianceService);

  frameworks = [
    { name: 'CIS Benchmarks', description: 'Center for Internet Security', score: 0, violations: 0, critical: 0, scoreClass: 'unknown' },
    { name: 'SOC 2', description: 'Service Organization Control', score: 0, violations: 0, critical: 0, scoreClass: 'unknown' },
    { name: 'HIPAA', description: 'Health Insurance Portability', score: 0, violations: 0, critical: 0, scoreClass: 'unknown' },
    { name: 'GDPR', description: 'General Data Protection Regulation', score: 0, violations: 0, critical: 0, scoreClass: 'unknown' }
  ];

  ngOnInit(): void {
    // Compliance data will be populated after first scan
  }

  runScan(): void {
    this.complianceService.runScan().subscribe(() => {
      // Refresh compliance posture
    });
  }
}