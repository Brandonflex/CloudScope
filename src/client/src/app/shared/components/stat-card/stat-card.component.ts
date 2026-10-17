import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [MatCardModule, MatIconModule],
  template: `
    <mat-card class="stat-card" [style.border-left-color]="accentColor()">
      <div class="stat-header">
        <mat-icon [style.color]="accentColor()">{{ icon() }}</mat-icon>
        <span class="stat-label">{{ label() }}</span>
      </div>
      <div class="stat-value">{{ value() }}</div>
      @if (subtitle()) {
        <div class="stat-subtitle">{{ subtitle() }}</div>
      }
    </mat-card>
  `,
  styles: [`
    .stat-card {
      padding: 20px;
      border-left: 4px solid;
      background: #161b22;
      border-radius: 8px;
    }
    .stat-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .stat-label {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.7;
    }
    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      line-height: 1;
    }
    .stat-subtitle {
      margin-top: 8px;
      font-size: 0.8rem;
      opacity: 0.5;
    }
  `]
})
export class StatCardComponent {
  label = input.required<string>();
  value = input.required<string>();
  icon = input<string>('analytics');
  accentColor = input<string>('#4fc3f7');
  subtitle = input<string>();
}