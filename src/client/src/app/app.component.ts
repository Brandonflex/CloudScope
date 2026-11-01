import { Component, OnInit, inject } from '@angular/core';
import { MetaService } from './core/services/meta.service';
import { LiveInventoryComponent } from './features/live/live-inventory.component';
import { NavShellComponent } from './layout/nav-shell.component';

@Component({
  selector: 'app-root',
  imports: [NavShellComponent, LiveInventoryComponent],
  template: `
    @if (meta.liveLoginRequired() || meta.status()?.liveInventoryOnly) {
      <app-live-inventory />
    } @else if (meta.status()) {
      <app-nav-shell />
    } @else if (meta.statusResolved()) {
      <main class="connection-state" role="status">
        <div class="connection-panel">
          <p class="eyebrow">CLOUDSCOPE</p>
          <h1>Connection unavailable</h1>
          <p>
            We couldn't verify the backend. No inventory or billing data is available right now.
          </p>
          <p>Free services can take a minute to wake up. Check the connection and try again.</p>
          <button type="button" (click)="meta.loadStatus()">Retry connection</button>
        </div>
      </main>
    } @else {
      <main class="connection-state" role="status"><p>Connecting to CloudScope…</p></main>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .connection-state {
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0d1117;
        color: #e6edf3;
        font-family: Inter, system-ui, sans-serif;
        padding: 24px;
      }
      .connection-panel {
        max-width: 520px;
        padding: 32px;
        border: 1px solid #30363d;
        border-radius: 14px;
        background: #161b22;
      }
      .connection-panel p {
        color: #a8b4c2;
        line-height: 1.6;
      }
      .connection-panel .eyebrow {
        color: #79c0ff;
        letter-spacing: 0.12em;
        font-size: 0.75rem;
      }
      button {
        background: #1f6feb;
        color: white;
        border: 1px solid #3c648f;
        border-radius: 8px;
        padding: 10px 15px;
        cursor: pointer;
        font: inherit;
      }
    `
  ]
})
export class AppComponent implements OnInit {
  readonly meta = inject(MetaService);

  ngOnInit(): void {
    this.meta.loadStatus();
  }
}
