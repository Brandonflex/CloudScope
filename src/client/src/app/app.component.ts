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
    } @else {
      <app-nav-shell />
    }
  `,
  styles: [
    `
      :host {
        display: block;
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
