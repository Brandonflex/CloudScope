import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="stat-card" [style.--accent]="accentColor()">
      <div class="stat-top">
        <div class="stat-icon">
          <mat-icon>{{ icon() }}</mat-icon>
        </div>
        @if (badge()) {
          <span class="stat-badge" [class.negative]="badgeNegative()">{{ badge() }}</span>
        }
      </div>
      <div class="stat-value">{{ value() }}</div>
      <div class="stat-label">{{ label() }}</div>
      @if (subtitle()) {
        <div class="stat-subtitle">{{ subtitle() }}</div>
      }
    </div>
  `,
  styles: [
    `
      .stat-card {
        position: relative;
        background: linear-gradient(160deg, rgba(22, 27, 34, 0.95), rgba(13, 17, 23, 0.95));
        border: 1px solid var(--border, rgba(240, 246, 252, 0.08));
        border-radius: 14px;
        padding: 18px 20px;
        overflow: hidden;
        transition:
          transform 0.15s ease,
          border-color 0.15s ease;
      }
      .stat-card:hover {
        transform: translateY(-2px);
        border-color: color-mix(in srgb, var(--accent) 45%, transparent);
      }
      .stat-card::after {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        background: var(--accent);
        opacity: 0.85;
      }
      .stat-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      .stat-icon {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--accent) 16%, transparent);
        color: var(--accent);
      }
      .stat-icon mat-icon {
        font-size: 19px;
        width: 19px;
        height: 19px;
      }
      .stat-badge {
        font-size: 0.72rem;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 999px;
        color: #3fb950;
        background: rgba(63, 185, 80, 0.12);
      }
      .stat-badge.negative {
        color: #f85149;
        background: rgba(248, 81, 73, 0.12);
      }
      .stat-value {
        font-size: 1.85rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.1;
        color: #f0f6fc;
      }
      .stat-label {
        margin-top: 4px;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: #8b949e;
      }
      .stat-subtitle {
        margin-top: 8px;
        font-size: 0.8rem;
        color: #6e7681;
      }
    `
  ]
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly icon = input<string>('analytics');
  readonly accentColor = input<string>('#58a6ff');
  readonly subtitle = input<string>('');
  readonly badge = input<string>('');
  readonly badgeNegative = input<boolean>(false);
}
