import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavShellComponent } from './layout/nav-shell.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NavShellComponent],
  template: `<app-nav-shell />`,
  styles: [`:host { display: block; }`]
})
export class AppComponent {}