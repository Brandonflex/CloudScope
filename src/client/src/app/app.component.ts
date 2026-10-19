import { Component } from '@angular/core';
import { NavShellComponent } from './layout/nav-shell.component';

@Component({
  selector: 'app-root',
  imports: [NavShellComponent],
  template: `<app-nav-shell />`,
  styles: [
    `
      :host {
        display: block;
      }
    `
  ]
})
export class AppComponent {}
