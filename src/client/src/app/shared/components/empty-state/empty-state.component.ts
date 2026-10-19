import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatButtonModule],
  template: `
    <div class="empty-state">
      <div class="empty-icon"><mat-icon>{{ icon() }}</mat-icon></div>
      <h3>{{ title() }}</h3>
      @if (message()) { <p>{{ message() }}</p> }
      @if (actionLabel()) {
        <button mat-stroked-button color="primary" (click)="action.emit()">{{ actionLabel() }}</button>
      }
    </div>
  `,
  styles: [`
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 48px 24px;
      text-align: center;
      color: #8b949e;
    }
    .empty-icon {
      width: 52px;
      height: 52px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(88, 166, 255, 0.1);
      color: #58a6ff;
      margin-bottom: 6px;
    }
    .empty-icon mat-icon { font-size: 26px; width: 26px; height: 26px; }
    h3 { margin: 0; font-size: 1rem; color: #c9d1d9; font-weight: 600; }
    p { margin: 0; font-size: 0.85rem; max-width: 420px; line-height: 1.5; }
    button { margin-top: 10px; }
  `]
})
export class EmptyStateComponent {
  readonly icon = input<string>('inbox');
  readonly title = input.required<string>();
  readonly message = input<string>('');
  readonly actionLabel = input<string>('');
  readonly action = output<void>();
}
