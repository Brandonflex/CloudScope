import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="spinner-container">
      <mat-spinner diameter="34" strokeWidth="3" />
      @if (message()) { <p>{{ message() }}</p> }
    </div>
  `,
  styles: [`
    .spinner-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 40px;
      min-height: 160px;
    }
    p { margin: 0; font-size: 0.85rem; color: #8b949e; }
  `]
})
export class LoadingSpinnerComponent {
  readonly message = input<string>('Loading…');
}
