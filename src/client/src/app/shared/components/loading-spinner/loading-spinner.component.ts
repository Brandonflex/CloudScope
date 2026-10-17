import { Component, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="spinner-container">
      <mat-spinner diameter="40" />
      @if (message()) {
        <p class="spinner-message">{{ message() }}</p>
      }
    </div>
  `,
  styles: [`
    .spinner-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
    }
    .spinner-message {
      margin-top: 16px;
      opacity: 0.6;
      font-size: 0.9rem;
    }
  `]
})
export class LoadingSpinnerComponent {
  message = input<string>('Loading...');
}